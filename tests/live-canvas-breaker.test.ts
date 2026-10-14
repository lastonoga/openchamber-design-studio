import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { access, cp, mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const approved='/private/var/folders/hx/6ykzfqb5519dsfc25bzxxrzc0000gn/T/opencode';
const scratch=await mkdtemp(path.join(await access(approved).then(()=>approved,()=>tmpdir()),'live-canvas-breaker-'));
await mkdir(path.join(scratch,'service'));
for(const file of ['browser','artifact-context','viewer-server','viewer-ui'])await cp(path.join(root,'service',file+'.ts'),path.join(scratch,'service',file+'.ts'));
await cp(path.join(root,'shared'),path.join(scratch,'shared'),{recursive:true});
await symlink(path.join(root,'node_modules'),path.join(scratch,'node_modules'));
const mutant=process.env.LIVE_CANVAS_MUTANT;
async function mutate(file:string,from:string,to:string){const location=path.join(scratch,'service',file+'.ts'),source=await readFile(location,'utf8');assert.equal(source.split(from).length-1,1,'one scratch guard match');await writeFile(location,source.replace(from,to));}
if(mutant==='artifact-authorization')await mutate('browser','if(context.matches(context.artifact(),session,params.executionContextId)) {',"if(params.name==='__dsPick'||params.name==='__dsArtifactEvent') {");
else if(mutant==='payload-bound')await mutate('browser',"if(typeof params.payload!=='string'||params.payload.length>24000)return;","if(typeof params.payload!=='string')return;");
else if(mutant==='capture-finally')await mutate('browser','finally{await this.shellEval(`__dsCanvas.endCapture(${JSON.stringify(token)})`);}','finally{/* scratch: no renderer capture restoration */}');
else if(mutant==='server-path')await mutate('viewer-server','req.url !== capability ? 404 :','false ? 404 :');
else if(mutant==='pointer-cancellation'){
  await mutate('browser','    consumed=null;\n    if(!window.__dsViewerFlags.menu)return;','    /* scratch: stale sequence remains */\n    if(!window.__dsViewerFlags.menu)return;');
  await mutate('browser',"document.addEventListener('pointercancel',e=>{if(matches(e))consumed=null;},true);","document.addEventListener('pointercancel',()=>undefined,true);");
  await mutate('browser',"document.addEventListener('lostpointercapture',e=>{if(matches(e)&&!consumed.ended)consumed=null;},true);","document.addEventListener('lostpointercapture',()=>undefined,true);");
  await mutate('browser',"window.addEventListener('blur',()=>{consumed=null;});","window.addEventListener('blur',()=>undefined);");
  await mutate('browser','if(e.detail!==0&&matches(e)){consumed=null;','if(e.detail!==0&&consumed){consumed=null;');
}
else if(mutant==='uncancelled-click-suppression')await mutate('browser','if(e.detail!==0&&matches(e)){consumed=null;e.preventDefault();e.stopImmediatePropagation();}','if(e.detail!==0&&matches(e)){consumed=null;}');
else assert.equal(mutant,undefined,'known scratch mutant');
const {Browser}=await import(pathToFileURL(path.join(scratch,'service/browser.ts')).href) as typeof import('../service/browser.ts');
const {startViewerServer}=await import(pathToFileURL(path.join(scratch,'service/viewer-server.ts')).href) as typeof import('../service/viewer-server.ts');
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const mods={alt:false,ctrl:false,meta:false,shift:false};
const forged={selector:'#forged',tag:'button',classes:'',text:'forged',outerHTML:'<button id="forged"></button>',styles:{},rect:{x:1,y:1,width:10,height:10}};
const fixture='<!doctype html><title>Breaker artifact</title><style>html,body{margin:0;background:#eef;min-height:100vh}button,a{position:absolute;left:40px;top:40px;width:150px;height:50px}a{top:110px}</style><button id="counter" onclick="window.clicks++">Count</button><a id="escape" target="_top" href="/attacker">Leave viewer</a><script>window.identity=crypto.randomUUID();window.clicks=0;window.nativeEvents=[];for(const type of ["pointerdown","pointercancel","click","keydown","keypress","keyup"])document.addEventListener(type,e=>nativeEvents.push({type:e.type,trusted:e.isTrusted,key:e.key,detail:e.detail,target:e.target.id}),true)</script>';
type Internals={cdp:{send:(method:string,params?:any,session?:string)=>Promise<any>};sessionId:string;canvasFlags:{menu:boolean;pan:boolean}};
const internal=(browser:InstanceType<typeof Browser>)=>browser as unknown as Internals;
async function shell(browser:InstanceType<typeof Browser>,expression:string){const b=internal(browser),r=await b.cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},b.sessionId);if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
async function owned(run:(browser:InstanceType<typeof Browser>,url:string,receipts:Array<{url:string;referer:string}>)=>Promise<void>){
  const receipts:Array<{url:string;referer:string}>=[];
  const app=createServer((req,res)=>{receipts.push({url:req.url||'',referer:String(req.headers.referer||'')});if(req.url==='/redirect'){res.writeHead(302,{location:'/'});res.end();return;}res.writeHead(200,{'content-type':'text/html'});res.end(req.url==='/attacker'?'<title>Attacker top page</title><script>window.attackerIdentity=crypto.randomUUID();window.__dsCanvas={setViewport:(w,h)=>{window.receivedViewport=[w,h]}};</script>':fixture);});
  await new Promise<void>(resolve=>app.listen(0,'127.0.0.1',resolve));const address=app.address();assert.ok(address&&typeof address==='object');
  const before=process.env.DS_WINDOW;process.env.DS_WINDOW='-2400,-2400,820,650';const browser=new Browser();if(before===undefined)delete process.env.DS_WINDOW;else process.env.DS_WINDOW=before;
  try{const url=`http://localhost:${address.port}`;assert.equal((await browser.open(url+'/')).settled,true,'owned artifact is actually ready');await run(browser,url,receipts);}
  finally{await browser.close();app.closeAllConnections();await new Promise<void>(resolve=>app.close(()=>resolve()));}
}
async function nativeClick(browser:InstanceType<typeof Browser>,x=70,y=60){const b=internal(browser);await shell(browser,'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');const point=await shell(browser,`(()=>{const f=document.getElementById('preview'),r=f.getBoundingClientRect();return {x:r.x+${x}*r.width/f.clientWidth,y:r.y+${y}*r.height/f.clientHeight}})()`);assert.ok(point.x>=0&&point.y>=0,'native fixture target remains within main viewport');for(const type of ['mousePressed','mouseReleased'])await b.cdp.send('Input.dispatchMouseEvent',{type,x:point.x,y:point.y,button:'left',buttons:type==='mousePressed'?1:0,clickCount:1},b.sessionId);}
test('A4 escaped top-level attacker must not acquire shell binding authority',{timeout:30000},async()=>{
  await owned(async(browser,url)=>{
    // This tests document authority, not asynchronous Page-height qualification.
    // Use an exact controlled viewport before arranging its one native link click.
    await browser.resize(1280,800);
    assert.deepEqual(await browser.evaluate('({width:innerWidth,height:innerHeight})'),{width:1280,height:800});
    const before={viewport:browser.viewport(),flags:{...internal(browser).canvasFlags}};
    await nativeClick(browser,70,130); // real artifact target=_top navigation
    let location='';for(let i=0;i<40;i++){location=await shell(browser,'location.href');if(location===url+'/attacker')break;await pause(25);}assert.equal(location,url+'/attacker','attacker loaded by native link');
    const identity=await shell(browser,'attackerIdentity');
    const bindingType=await shell(browser,'typeof __dsCanvasSend');assert.equal(bindingType,'function','runtime binding persists across actual navigation');
    await shell(browser,"__dsCanvasSend(JSON.stringify({type:'viewport',width:390,height:844}));__dsShellState(JSON.stringify({menu:true,pan:true}));");await pause(150);
    const after={viewport:browser.viewport(),flags:{...internal(browser).canvasFlags}};
    console.info('A4 evidence:',JSON.stringify({attackerIdentity:identity,bindingType,input:{viewport:[390,844],menu:true,pan:true},before,after}));
    assert.deepEqual(after,before,'non-private top document must not command backend viewport or flags');
  });
});

test('A1 spoofed same-origin and OOPIF descendants cannot forge a complete pick',{timeout:30000},async()=>{
  await owned(async(browser,url)=>{
    await browser.evaluate(`(()=>{for(const src of [${JSON.stringify(url+'/same')},${JSON.stringify(url.replace('localhost','127.0.0.1')+'/cross')}]){const f=document.createElement('iframe');f.name='__dsArtifact';f.src=src;document.body.append(f);}})()`);await pause(150);
    const b=internal(browser),targets=await b.cdp.send('Target.getTargets');
    // First send from a real same-origin descendant using its actual binding.
    const before=(await browser.state()).pickSeq;
    await browser.evaluate(`(()=>{const w=document.querySelector('iframe').contentWindow;w.__dsTrustedArtifact=true;w.__dsPick(JSON.stringify(${JSON.stringify(forged)}));})()`);
    const oopif=targets.targetInfos.find((target:any)=>target.type==='iframe'&&target.url.includes('/cross'));assert.ok(oopif,'real cross-site descendant target exists');
    const attached=await b.cdp.send('Target.attachToTarget',{targetId:oopif.targetId,flatten:true});
    const call=await b.cdp.send('Runtime.evaluate',{expression:`window.__dsTrustedArtifact=true;__dsPick(JSON.stringify(${JSON.stringify(forged)}))`,returnByValue:true},attached.sessionId);assert.equal(call.exceptionDetails,undefined,'OOPIF complete binding call really executed');await pause(100);
    assert.equal((await browser.state()).pickSeq,before,'complete valid child payload cannot bypass exact artifact frame ownership');
  });
});

test('A3 oversized complete artifact payload cannot increment pick before one valid pick',{timeout:30000},async()=>{
  await owned(async(browser)=>{
    const before=(await browser.state()).pickSeq;
    await browser.evaluate(`__dsPick(${JSON.stringify(JSON.stringify(forged)+' '.repeat(24001))})`);await pause(75);
    const rejected=(await browser.state()).pickSeq;
    await browser.evaluate(`__dsPick(${JSON.stringify(JSON.stringify(forged))})`);await pause(75);
    const accepted=(await browser.state()).pickSeq;
    assert.deepEqual([rejected-before,accepted-rejected],[0,1],'oversized JSON envelope must be rejected, then bounded valid pick accepted exactly once');
  });
});

test('C1 failure immediately after beginCapture restores renderer transaction and native interaction',{timeout:30000},async()=>{
  await owned(async(browser)=>{
    await browser.restoreCamera({mode:'manual',scale:.35,panX:11,panY:-9});
    const before={camera:await browser.getCamera(),styles:await shell(browser,"['camera','canvas','preview'].map(id=>document.getElementById(id).style.cssText)"),body:await shell(browser,'document.body.style.cssText'),identity:await browser.evaluate('identity'),width:await browser.evaluate('innerWidth')};
    const b=internal(browser),send=b.cdp.send.bind(b.cdp);let injected=false;
    b.cdp.send=(method,params,session)=>{if(method==='Emulation.setDeviceMetricsOverride'&&!injected){injected=true;return Promise.reject(new Error('owned early metrics failure'));}return send(method,params,session);};
    try{await assert.rejects(browser.capture(),/owned early metrics failure/);}finally{b.cdp.send=send;}
    const after={camera:await browser.getCamera(),styles:await shell(browser,"['camera','canvas','preview'].map(id=>document.getElementById(id).style.cssText)"),body:await shell(browser,'document.body.style.cssText'),identity:await browser.evaluate('identity'),width:await browser.evaluate('innerWidth')};
    const active=await shell(browser,'__dsCaptureActive');await nativeClick(browser);const clicks=await browser.evaluate('clicks');
    console.info('C1 evidence:',JSON.stringify({injected,active,clicks,sameIdentity:before.identity===after.identity}));
    assert.deepEqual({after,active,clicks},{after:before,active:false,clicks:1},'early error cannot leave camera/frozen flags/styles or native interaction changed');
  });
});

async function raw(url:string,target:string,host?:string,method='GET'):Promise<number>{const u=new URL(url);return new Promise((resolve,reject)=>{const req=request({hostname:'127.0.0.1',port:u.port,path:target,method,headers:{host:host||u.host}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode||0));});req.on('error',reject);req.end();});}
test('A5 exact private-server targets and launch capabilities stay isolated; artifact referrer absent',{timeout:30000},async()=>{
  const config={url:'',pages:[],viewport:{width:1280,height:800}};
  const first=await startViewerServer(config),second=await startViewerServer(config);
  try{
    const p=new URL(first.url).pathname,q=new URL(second.url).pathname;
    const statuses=await Promise.all([raw(first.url,p),raw(first.url,p+'?x=1'),raw(first.url,p+'/'),raw(first.url,q),raw(first.url,p,'localhost:'+new URL(first.url).port),raw(first.url,p,undefined,'POST')]);
    await owned(async(browser,url,receipts)=>{const privateOrigin=new URL(await shell(browser,'location.href')).origin;await browser.navigate(url+'/redirect');await browser.evaluate('location.reload()');await pause(150);const referers=receipts.filter(r=>['/','/redirect'].includes(r.url)).map(r=>r.referer);assert.ok(referers.length>=3,'recorded real initial/redirect/reload requests');assert.ok(referers.every(r=>!r.includes('/canvas/')&&!r.includes(privateOrigin)),'artifact referrer cannot contain private capability/origin; self-referrer on reload is allowed');});
    console.info('A5 evidence:',JSON.stringify({statuses,distinctCapabilities:p!==q}));
    assert.deepEqual(statuses,[200,404,404,404,403,405],'raw exact target/method/Host gates must reject sibling capability and variants');
  }finally{await first.close();await second.close();}
});

test('A6 native touch cancellation after menu dismissal must not consume next ordinary click',{timeout:30000},async()=>{
  await owned(async(browser)=>{
    await shell(browser,"document.getElementById('zoom').click()");await pause(60);
    assert.equal(internal(browser).canvasFlags.menu,true,'real menu flag propagated');
    const p=await shell(browser,"(()=>{const f=document.getElementById('preview'),r=f.getBoundingClientRect();return {x:r.x+70*r.width/f.clientWidth,y:r.y+60*r.height/f.clientHeight}})()"),b=internal(browser);
    await b.cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y,id:1}]},b.sessionId);await pause(80);
    await b.cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]},b.sessionId);await pause(60);
    assert.equal(internal(browser).canvasFlags.menu,false,'native pointerdown dismissed menu');
    await nativeClick(browser);const events=await browser.evaluate('nativeEvents'),clicks=await browser.evaluate('clicks');
    console.info('A6 evidence:',JSON.stringify({events,clicks}));
    assert.ok((events as Array<{type:string;trusted:boolean}>).some(e=>e.type==='pointercancel'&&e.trusted),'genuine trusted pointercancel reached artifact');
    assert.equal(clicks,1,'a canceled dismissal sequence cannot swallow the next native click');
  });
});

async function barrier(check:()=>Promise<boolean>,description:string){for(let i=0;i<80;i++){if(await check())return;await pause(20);}assert.fail(description);}
async function nativeMouse(browser:InstanceType<typeof Browser>,type:string,point:{x:number;y:number}){const b=internal(browser);await b.cdp.send('Input.dispatchMouseEvent',{type,x:point.x,y:point.y,button:'left',buttons:type==='mousePressed'?1:0,clickCount:1},b.sessionId);}
async function openZoom(browser:InstanceType<typeof Browser>){const p=await shell(browser,"(()=>{const r=document.getElementById('zoom').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");await nativeMouse(browser,'mousePressed',p);await nativeMouse(browser,'mouseReleased',p);await barrier(async()=>internal(browser).canvasFlags.menu,'native Zoom menu did not open');}

test('B6 uncancelled dismissal suppresses original native click but not next click or keyboard',{timeout:30000},async()=>{
  await owned(async(browser)=>{
    await openZoom(browser);
    const p=await shell(browser,"(()=>{const f=document.getElementById('preview'),r=f.getBoundingClientRect();return {x:r.x+70*r.width/f.clientWidth,y:r.y+60*r.height/f.clientHeight}})()");
    await nativeMouse(browser,'mousePressed',p);
    await barrier(async()=>!internal(browser).canvasFlags.menu&&await shell(browser,"document.activeElement.id==='zoom'"),'dismissal acknowledgement/focus did not arrive');
    await nativeMouse(browser,'mouseReleased',p);
    const original=await browser.evaluate('clicks');
    await nativeClick(browser);const independent=await browser.evaluate('clicks');
    await browser.evaluate("document.getElementById('counter').focus()");
    assert.equal(await browser.evaluate('document.activeElement.id'),'counter','keyboard fixture focus really belongs to native button');
    const b=internal(browser);await b.cdp.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},b.sessionId);await b.cdp.send('Input.dispatchKeyEvent',{type:'char',key:'Enter',text:'\r',unmodifiedText:'\r',windowsVirtualKeyCode:13},b.sessionId);await b.cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},b.sessionId);
    const keyboard=await browser.evaluate('clicks'),events=await browser.evaluate('nativeEvents');
    console.info('B6 evidence:',JSON.stringify({original,independent,keyboard,events}));
    assert.deepEqual([original,independent,keyboard],[0,1,2],'uncancelled dismissed native sequence must not activate app; next pointer/keyboard sequences must');
  });
});
