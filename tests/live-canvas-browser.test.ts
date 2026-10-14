import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createConnection } from 'node:net';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import { Browser } from '../service/browser.ts';
import { ensureBrowser } from '../service/surface.ts';
import { runVerification } from '../service/verify.ts';

const chrome = process.env.DS_CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const mods = { alt: false, ctrl: false, meta: false, shift: false };
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const fixture = '<!doctype html><title>Artifact fixture</title><style>html,body{margin:0;min-height:100vh;background:#0000ff}#a{position:absolute;left:0;top:0;width:8px;height:8px;background:#ff0000}#z{position:fixed;right:0;bottom:0;width:8px;height:8px;background:#00ff00}button{position:absolute;left:40px;top:40px;width:80px;height:40px}input{position:absolute;left:140px;top:40px}</style><div id=a></div><div id=z></div><button id=button onclick="this.textContent=\'Clicked\'">Button</button><input id=input><script>window.fixtureIdentity=crypto.randomUUID();window.inputReceipts=[];document.addEventListener("click",e=>inputReceipts.push({x:e.clientX,y:e.clientY,id:e.target.id}))</script>';

type NavigationFixture = { requests: string[]; slowRequested: Promise<void>; releaseSlow(): void };
async function owned(run: (browser: Browser, url: string, navigation: NavigationFixture) => Promise<void>, singleton = false) {
  const requests: string[]=[];
  let slowResponse: import('node:http').ServerResponse | undefined;
  let requested!:()=>void;
  const slowRequested=new Promise<void>(resolve=>{requested=resolve;});
  const server = createServer((req, res) => {
    requests.push(req.url??'');
    if(req.url==='/redirect'){res.writeHead(302,{location:'/'});res.end();return;}
    if(req.url==='/slow'&&!slowResponse){slowResponse=res;requested();return;}
    res.writeHead(200, { 'content-type': 'text/html', 'cache-control':'no-store', ...(req.url === '/blocked' ? { 'x-frame-options': 'DENY', 'content-security-policy': "frame-ancestors 'none'" } : {}) });
    res.end(fixture);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const prior = process.env.DS_WINDOW;
  process.env.DS_WINDOW = '-2400,-2400,820,650';
  const browser = singleton ? await ensureBrowser() : new Browser();
  if (prior === undefined) delete process.env.DS_WINDOW; else process.env.DS_WINDOW = prior;
  try { await run(browser, `http://localhost:${address.port}/`, {requests,slowRequested,releaseSlow(){assert.ok(slowResponse);slowResponse.writeHead(200,{'content-type':'text/html','cache-control':'no-store'});slowResponse.end(fixture);}}); }
  finally { await browser.close(); server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
}

async function shell(browser: Browser, expression: string): Promise<any> {
  const internal = browser as unknown as { cdp: { send: (method: string, params: object, session: string) => Promise<any> }; sessionId: string };
  const reply = await internal.cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, internal.sessionId);
  if (reply.exceptionDetails) throw new Error(JSON.stringify(reply.exceptionDetails));
  return reply.result.value;
}

/** Decode actual compositor PNG pixels, including all standard PNG row filters. */
function pngPixels(png: Buffer) {
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20), channels = png[25] === 6 ? 4 : 3;
  assert.ok(png[25] === 6 || png[25] === 2, 'expected RGB/RGBA PNG');
  const chunks: Buffer[] = [];
  for (let at = 8; at < png.length;) { const size = png.readUInt32BE(at); if (png.toString('ascii', at + 4, at + 8) === 'IDAT') chunks.push(png.subarray(at + 8, at + 8 + size)); at += size + 12; }
  const raw = inflateSync(Buffer.concat(chunks)), stride = width * channels, pixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) for (let x = 0; x < stride; x++) {
    const filter = raw[y * (stride + 1)]!, value = raw[y * (stride + 1) + x + 1]!;
    const a = x >= channels ? pixels[y * stride + x - channels]! : 0, b = y ? pixels[(y - 1) * stride + x]! : 0, c = y && x >= channels ? pixels[(y - 1) * stride + x - channels]! : 0;
    const p = a + b - c, pa = Math.abs(p-a), pb = Math.abs(p-b), pc = Math.abs(p-c);
    const predictors = [0, a, b, Math.floor((a+b)/2), pa <= pb && pa <= pc ? a : pb <= pc ? b : c];
    pixels[y * stride + x] = (value + predictors[filter]!) & 255;
  }
  return { width, height, pixel: (x: number, y: number) => [...pixels.subarray((y*width+x)*channels, (y*width+x)*channels+3)] };
}

test('actual Browser canvas keeps artifact viewport fixed under native window resize', { timeout: 60000 }, async (t) => {
  try { await access(chrome); } catch { t.skip('Chrome unavailable'); return; }
  await owned(async (browser, url) => {
    assert.equal((await browser.open(url)).settled, true);
    assert.equal(await browser.evaluate('innerWidth'), 1280);
    await browser.placeWindow(-2400, -2400, 620, 480);
    await pause(150);
    assert.equal(await browser.evaluate('innerWidth'), 1280);
    assert.equal((await browser.getProbe()).innerWidth, 1280);
    assert.equal((await browser.state()).title, 'Artifact fixture');
    const targets = await browser.jsonList();
    assert.notEqual(targets.find((target) => target.type === 'page')?.url, url, 'page target is private shell, not artifact');
    assert.equal(await browser.pageTargetCount(), 1);
  });
});

test('functional redirect confirms the new canonical document rather than rejecting its final URL', { timeout:60000 }, async(t)=>{
  try { await access(chrome); } catch { t.skip('Chrome unavailable');return; }
  await owned(async(browser,url,nav)=>{
    await browser.open(url);
    const prior=await browser.evaluate('fixtureIdentity');
    const offset=nav.requests.length;
    const result=await browser.navigate(url+'redirect');
    assert.equal(result.settled,true,'valid 302 to a new ready canonical document must succeed');
    assert.equal(result.url,url);
    assert.notEqual(await browser.evaluate('fixtureIdentity'),prior);
    assert.equal(await browser.evaluate('document.body.getBoundingClientRect().width'),1280);
    assert.equal(await shell(browser,"document.getElementById('status').textContent"),'Ready');
    assert.deepEqual(nav.requests.slice(offset).filter(path=>path==='/'||path==='/redirect'),['/redirect','/']);
    console.log('[redirect completion]',JSON.stringify({result,newDocument:true,readyBodyWidth:1280}));
  });
});

test('same Browser recovers from refused IPv4 to authoritative IPv6 commit, reload and canonical redirect', {timeout:60000},async(t)=>{
  try { await access(chrome); } catch { t.skip('Chrome unavailable');return; }
  const server=createServer((req,res)=>{
    if(req.url==='/redirect'){res.writeHead(302,{location:'/'});res.end();return;}
    res.writeHead(200,{'content-type':'text/html','cache-control':'no-store'});
    res.end('<!doctype html><title>Owned IPv6 fixture</title><style>html,body{margin:0;min-height:800px}</style><h1 id=proof>IPv6 ready body</h1>');
  });
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen({host:'::1',port:0,ipv6Only:true},resolve);});
  const address=server.address();assert.ok(address&&typeof address==='object');
  const v4=`http://127.0.0.1:${address.port}/`,v6=`http://[::1]:${address.port}/`;
  const previousWindow=process.env.DS_WINDOW;process.env.DS_WINDOW='-2400,-2400,820,650';
  const browser=new Browser();
  if(previousWindow===undefined)delete process.env.DS_WINDOW;else process.env.DS_WINDOW=previousWindow;
  try{
    const refusal=await new Promise<string>((resolve,reject)=>{
      const socket=createConnection({host:'127.0.0.1',port:address.port});
      socket.once('connect',()=>{socket.destroy();reject(new Error('IPv4 unexpectedly connected'));});
      socket.once('error',error=>resolve((error as NodeJS.ErrnoException).code??''));
    });
    assert.equal(refusal,'ECONNREFUSED');
    assert.equal((await fetch(v6)).status,200,'owned IPv6 fixture is reachable before Chrome');
    assert.equal((await browser.open(v4)).settled,false,'first IPv4 navigation fails honestly');
    const failedContext=(browser as any).contexts.artifact();
    const result=await browser.open(v6);
    assert.equal(result.settled,true,'same instance must confirm the new IPv6 document, not retain the error-document loader');
    assert.equal(result.url,v6);assert.equal(result.title,'Owned IPv6 fixture');
    assert.deepEqual(await browser.evaluate('({url:location.href,title:document.title,width:innerWidth,bodyWidth:document.body.getBoundingClientRect().width,text:document.getElementById("proof").textContent})'),
      {url:v6,title:'Owned IPv6 fixture',width:1280,bodyWidth:1280,text:'IPv6 ready body'});
    assert.equal(await browser.pageTargetCount(),1);
    assert.equal(await shell(browser,"document.getElementById('status').textContent"),'Ready');
    const internals=browser as any,current=internals.contexts.artifact();
    assert.notEqual(current.unique,failedContext.unique);
    const tree=await internals.cdp.send('Page.getFrameTree',{},current.session);
    assert.equal(tree.frameTree.frame.id,current.frame,'authoritative child tree belongs to the exact artifact');
    assert.equal(internals.contexts.artifactLoaderId(),tree.frameTree.frame.loaderId);
    const beforeReload=await browser.evaluate('performance.timeOrigin');
    assert.equal((await browser.open(v6)).settled,true,'IPv6 same-URL reload also confirms its loader');
    assert.notEqual(await browser.evaluate('performance.timeOrigin'),beforeReload);
    const canonical=await browser.navigate(v6+'redirect');
    assert.equal(canonical.settled,true);assert.equal(canonical.url,v6);
    assert.equal(await shell(browser,"document.getElementById('status').textContent"),'Ready');
    console.log('[IPv6 recovery]',JSON.stringify({refusal,firstSettled:false,recovered:result,reload:true,canonical,bodyWidth:1280,pageTargets:1,loaderMatchesCurrentFrame:true}));
  }finally{
    await browser.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));
  }
});

test('functional request barrier rejects cached old document; same-URL reload is once and hash navigation retains identity', {timeout:60000},async(t)=>{
  try { await access(chrome); } catch { t.skip('Chrome unavailable');return; }
  await owned(async(browser,url,nav)=>{
    await browser.open(url);
    const prior=await browser.evaluate('fixtureIdentity');
    let completed=false;
    const pending=browser.navigate(url+'slow').then(result=>{completed=true;return result;});
    await nav.slowRequested;
    assert.equal(completed,false,'request receipt alone must not confirm cached ready state');
    nav.releaseSlow();
    const arrived=await pending;
    assert.equal(arrived.settled,true);
    assert.equal(arrived.url,url+'slow','cached root URL cannot satisfy the new request');
    const fresh=await browser.evaluate('fixtureIdentity');
    assert.notEqual(fresh,prior);
    const initialRequests=nav.requests.filter(path=>path==='/slow').length;
    assert.equal((await browser.navigate(url+'slow')).settled,true);
    assert.equal(nav.requests.filter(path=>path==='/slow').length-initialRequests,1,'same URL reload must issue only one navigation');
    const reloaded=await browser.evaluate('fixtureIdentity');
    assert.notEqual(reloaded,fresh);
    await browser.evaluate("document.getElementById('input').value='retain across hash'");
    const hash=await browser.navigate(url+'slow#chosen');
    assert.equal(hash.settled,true);
    assert.equal(hash.url,url+'slow#chosen');
    assert.equal(await browser.evaluate('fixtureIdentity'),reloaded);
    assert.equal(await browser.evaluate("document.getElementById('input').value"),'retain across hash');
    console.log('[navigation barrier]',JSON.stringify({oldDocumentRejected:true,reloadRequests:1,hashPreserved:true}));
  });
});

test('actual Browser canvas maps native input and excludes shell/siblings from artifact operations', { timeout: 60000 }, async (t) => {
  try { await access(chrome); } catch { t.skip('Chrome unavailable'); return; }
  await owned(async (browser, url) => {
    await browser.open(url);
    assert.equal(await shell(browser, '!!window.__dsCanvas'), true);
    const identity = await browser.evaluate('window.fixtureIdentity');
    assert.ok(Number(await browser.evaluate('document.body.getBoundingClientRect().width')) > 0, 'ready must have actual artifact layout');
    await browser.evaluate("document.getElementById('input').value='retained'");
    await shell(browser, "__dsCanvas.restoreCamera({mode:'manual',scale:.5,panX:15,panY:10})");
    await browser.input([{ type:'pointer',action:'down',x:60,y:60,button:0,buttons:1,modifiers:mods },{ type:'pointer',action:'up',x:60,y:60,button:0,buttons:0,modifiers:mods }]);
    assert.equal(await browser.evaluate("document.getElementById('button').textContent"), 'Clicked');
    assert.deepEqual(await browser.evaluate('inputReceipts[0]'), {x:60,y:60,id:'button'});
    const meta = { ...mods, meta: true };
    await browser.input([{type:'pointer',action:'down',x:60,y:60,button:0,buttons:1,modifiers:meta},{type:'pointer',action:'up',x:60,y:60,button:0,buttons:0,modifiers:meta}]);
    await pause(100);
    assert.equal((await browser.state()).lastPick?.selector, '#button');
    assert.equal(await browser.evaluate('typeof window.__dsCanvas'), 'undefined');
    const before = (await browser.state()).pickSeq;
    await shell(browser, "window.__dsPick && window.__dsPick(JSON.stringify({selector:'#shell'}))");
    await shell(browser, "window.__dsCanvasSend(JSON.stringify({type:'viewport',width:1,height:Infinity}))");
    await pause(100);
    assert.equal((await browser.state()).pickSeq, before);
    assert.equal(browser.viewport().width, 1280);
    // Real trusted-shell controls remain usable after provenance tightening.
    await shell(browser,"__dsCanvasSend(JSON.stringify({type:'viewport',width:768,height:1024}))");
    await pause(100);
    assert.deepEqual(browser.viewport(),{width:768,height:1024});
    await browser.resize(1280,800);
    await browser.evaluate("location.hash='visited'");
    await pause(100);
    assert.match((await browser.state()).url, /#visited$/);
    assert.equal(await browser.evaluate('window.fixtureIdentity'), identity);
    assert.equal(await browser.evaluate("document.getElementById('input').value"), 'retained');
    await browser.evaluate("history.pushState({},'', '/spa');document.title='SPA fixture'");
    await pause(100);
    assert.match((await browser.state()).url, /\/spa$/);
    assert.equal(await browser.evaluate('window.fixtureIdentity'), identity);
    assert.equal(await browser.evaluate("document.getElementById('input').value"), 'retained');
    assert.match(await shell(browser, "document.getElementById('pages').title"), /\/spa$/);
    const camera = await shell(browser, '__dsCanvas.getCamera()');
    await browser.navigate(url + 'second');
    assert.notEqual(await browser.evaluate('window.fixtureIdentity'), identity);
    assert.equal((await shell(browser, '__dsCanvas.getCamera()')).scale, camera.scale);
    const blocked = await browser.navigate(url + 'blocked');
    assert.equal(blocked.settled, false, 'XFO/CSP are not bypassed');
    assert.match(await shell(browser, "document.getElementById('status').textContent"), /failed/i);
  });
});

test('actual Browser captures exact wide artifact corners and restores camera even on capture failure', { timeout: 60000 }, async (t) => {
  try { await access(chrome); } catch { t.skip('Chrome unavailable'); return; }
  await owned(async (browser, url) => {
    await browser.open(url);
    assert.equal(await shell(browser, '!!window.__dsCanvas'), true);
    await browser.resize(2048, 1080);
    const identity = await browser.evaluate('window.fixtureIdentity');
    await shell(browser, "__dsCanvas.restoreCamera({mode:'manual',scale:1.7,panX:-60,panY:23})");
    const before = await shell(browser, '__dsCanvas.getCamera()');
    const shot = await browser.capture(), pixels = pngPixels(shot.png);
    await mkdir('.openchamber/live-canvas', { recursive:true });
    await writeFile('.openchamber/live-canvas/backend-artifact-2048.png', shot.png);
    console.log('[canvas PNG]', JSON.stringify({width:pixels.width,height:pixels.height,topLeft:pixels.pixel(1,1),bottomRight:pixels.pixel(2046,1078)}));
    assert.deepEqual([pixels.width,pixels.height], [2048,1080]);
    // Chrome embeds display-profile ICC data. Raw P3 samples differ from sRGB;
    // channel dominance independently rejects paper, blue and cropped frames.
    const red=pixels.pixel(1,1), green=pixels.pixel(2046,1078);
    assert.ok(red[0]!>=180&&red[0]!>red[1]!+100&&red[0]!>red[2]!+100, 'top-left must be dominant red, never paper/blue');
    assert.ok(green[1]!>=180&&green[1]!>green[0]!+100&&green[1]!>green[2]!+100, 'bottom-right must be dominant green, never paper/blue');
    assert.deepEqual(await shell(browser, '__dsCanvas.getCamera()'), before);
    assert.equal(await browser.evaluate('window.fixtureIdentity'), identity);
    const internals = browser as any, original = internals.cdp.send.bind(internals.cdp);
    const restoredStyles=await shell(browser, "['camera','canvas','preview'].map(id=>document.getElementById(id).style.cssText)");
    internals.cdp.send = (method:string,...args:any[]) => method === 'Page.captureScreenshot' ? Promise.reject(new Error('injected capture failure')) : original(method,...args);
    try { await assert.rejects(() => browser.capture(), /injected capture/); }
    finally { internals.cdp.send = original; }
    assert.deepEqual(await shell(browser, '__dsCanvas.getCamera()'), before);
    assert.equal(await browser.evaluate('innerWidth'), 2048);
    assert.deepEqual(await shell(browser, "['camera','canvas','preview'].map(id=>document.getElementById(id).style.cssText)"), restoredStyles);
    assert.equal(await shell(browser, 'window.__dsCaptureActive'), false);
    assert.equal(await browser.evaluate('window.fixtureIdentity'), identity);
    console.log('[capture finally]', JSON.stringify({cameraRestored:true,stylesRestored:true,artifactWidth:2048,captureActive:false}));
  });
});

test('direct verification restores artifact viewport and manual camera after success and an injected matrix exception', { timeout: 60000 }, async (t) => {
  try { await access(chrome); } catch { t.skip('Chrome unavailable'); return; }
  await owned(async (browser, url) => {
    await browser.open(url);
    await browser.resize(1280, 800);
    await browser.restoreCamera({mode:'manual',scale:.7,panX:12,panY:-8});
    const before=await browser.getCamera();
    await runVerification({dir:null,url,navigate:false,viewports:['mobile','wide']});
    assert.deepEqual(browser.viewport(), {width:1280,height:800});
    assert.deepEqual(await browser.getCamera(), before);
    const original=browser.getProbe.bind(browser);
    browser.getProbe=async()=>{throw new Error('injected matrix failure');};
    try { await assert.rejects(()=>runVerification({dir:null,url,navigate:false,viewports:['mobile']}), /injected matrix failure/); }
    finally { browser.getProbe=original; }
    assert.deepEqual(browser.viewport(), {width:1280,height:800});
    assert.deepEqual(await browser.getCamera(), before);
    console.log('[matrix finally]', JSON.stringify({viewport:browser.viewport(),cameraRestored:true,exception:'injected matrix failure'}));
  }, true);
});
