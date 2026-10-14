import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Browser } from '../service/browser.ts';

const mods={alt:false,ctrl:false,meta:false,shift:false};
async function shell(browser:Browser,expression:string):Promise<any>{const b=browser as any;const r=await b.cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},b.sessionId);if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
async function until(check:()=>Promise<boolean>,message:string){const deadline=Date.now()+4000;while(Date.now()<deadline){if(await check())return;await new Promise<void>(resolve=>setTimeout(resolve,20));}assert.fail(message);}
async function owned(run:(browser:Browser,url:string)=>Promise<void>){
  const server=createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html','cache-control':'no-store'});const variant=req.url==='/vh'?'height:100vh':req.url==='/huge'?'height:9000px':'height:1880px';res.end(`<!doctype html><title>Mode fixture</title><style>html,body{margin:0}main{${variant};position:relative}button{width:140px;height:44px}#footer{position:absolute;bottom:0;left:0}#nested{height:80px;width:180px;overflow:auto}#nested div{height:500px}.extra{height:1280px}</style><main><button id=first onclick="this.dataset.clicked='yes'">First</button><div id=nested><div>Nested scroll</div></div><button id=footer onclick="this.dataset.clicked='yes'">Last</button></main>${req.url==='/vh'?'<div class=extra></div>':''}<script>window.identity=crypto.randomUUID()</script>`);});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address==='object');
  const prior=process.env.DS_WINDOW;process.env.DS_WINDOW='-2400,-2400,820,650';const browser=new Browser();if(prior===undefined)delete process.env.DS_WINDOW;else process.env.DS_WINDOW=prior;
  try{await run(browser,`http://localhost:${address.port}/`);}finally{await browser.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
}

test('oracle qualification rejects hidden/nonfinite geometry before mode cases',async()=>{await owned(async(browser,url)=>{
  assert.equal((await browser.open(url)).settled,true);
  const actual=await browser.evaluate('({width:innerWidth,bodyWidth:document.body.getBoundingClientRect().width,footerWidth:document.getElementById("footer").getBoundingClientRect().width})') as any;
  assert.equal(actual.width,1280);assert.equal(actual.bodyWidth,1280);assert.ok(Number.isFinite(actual.footerWidth)&&actual.footerWidth>0);
  await browser.evaluate("document.getElementById('footer').hidden=true");
  assert.equal(await browser.evaluate("document.getElementById('footer').getBoundingClientRect().width"),0);
  assert.equal(Number.isFinite(Infinity),false);await browser.evaluate("document.getElementById('footer').hidden=false");
});});

test('Page qualifies one finite extent, native OOPIF first/footer input and nested wheel ownership',async()=>{await owned(async(browser,url)=>{
  await browser.open(url);
  assert.equal(typeof (browser as any).setLayout,'function','backend layout controller exists');
  await (browser as any).setLayout('page','desktop');
  assert.deepEqual(browser.viewport(),{width:1280,height:1880});
  const body=await browser.evaluate('({width:innerWidth,height:innerHeight,id:identity})') as any;assert.equal(body.height,1880);
  const camera=await browser.getCamera();assert.equal(camera?.layoutMode,'page');
  await browser.input([{type:'pointer',action:'down',x:50,y:20,button:0,buttons:1,modifiers:mods},{type:'pointer',action:'up',x:50,y:20,button:0,buttons:0,modifiers:mods}]);
  assert.equal(await browser.evaluate("document.getElementById('first').dataset.clicked"),'yes');
  await browser.input([{type:'wheel',x:50,y:80,deltaX:0,deltaY:60,modifiers:mods}]);
  await until(async()=>Number(await browser.evaluate("document.getElementById('nested').scrollTop"))>0,'nested widget receives native wheel');
  const move=await shell(browser,"(()=>{const f=document.getElementById('preview'),r=f.getBoundingClientRect(),c=document.getElementById('canvas').getBoundingClientRect();return {delta:r.y+(f.clientHeight-20)*r.height/f.clientHeight-(c.y+c.height/2)}})()");
  await browser.input([{type:'wheel',x:50,y:20,deltaX:0,deltaY:move.delta,modifiers:mods}]);
  await until(async()=>await shell(browser,"(()=>{const f=document.getElementById('preview'),r=f.getBoundingClientRect(),c=document.getElementById('canvas').getBoundingClientRect(),y=r.y+(f.clientHeight-20)*r.height/f.clientHeight;return y>c.y&&y<c.bottom})()"),'footer moves into real main viewport');
  await browser.input([{type:'pointer',action:'down',x:50,y:1860,button:0,buttons:1,modifiers:mods},{type:'pointer',action:'up',x:50,y:1860,button:0,buttons:0,modifiers:mods}]);
  assert.equal(await browser.evaluate("document.getElementById('footer').dataset.clicked"),'yes');
  assert.equal(await browser.evaluate('identity'),body.id);
});});

test('Fit and viewport transitions preserve safe nominal fallback and reachable native content',async()=>{await owned(async(browser,url)=>{
  await browser.open(url);assert.equal(typeof (browser as any).setLayout,'function');
  await (browser as any).setLayout('fit','fit');
  const bounds=await shell(browser,'__dsCanvas.getFitBounds()');assert.deepEqual(browser.viewport(),bounds);
  assert.equal((await browser.getCamera())?.layoutMode,'fit');assert.equal((await browser.getCamera())?.panY,0);
  await browser.placeWindow(-2400,-2400,620,480);
  await until(async()=>{const b=await shell(browser,'__dsCanvas.getFitBounds()');return browser.viewport().width===b.width&&browser.viewport().height===b.height;},'fit-size uses current available area');
  await browser.navigate(url+'vh');await (browser as any).setLayout('page','desktop');
  assert.deepEqual(browser.viewport(),{width:1280,height:800});assert.equal((await browser.getCamera())?.layoutMode,'viewport');assert.match(String((await browser.getCamera())?.reason),/stabili|grow|viewport/i);
  await browser.navigate(url+'huge');await (browser as any).setLayout('page','mobile');
  assert.deepEqual(browser.viewport(),{width:390,height:844});
  const fallback=await browser.getCamera();assert.equal(fallback?.layoutMode,'viewport');
  const reason=String(fallback?.reason??'');assert.ok(reason.trim().length>10,'conservative transition fallback has an actionable explanation');
  const visible=await shell(browser,"(()=>{const e=document.getElementById('layout-reason'),r=e.getBoundingClientRect();return {hidden:e.hidden,width:r.width,height:r.height,text:e.textContent}})()");
  assert.equal(visible.hidden,false);assert.ok(visible.width>0&&visible.height>0);
  assert.ok(visible.text.includes('Viewport fallback')&&visible.text.includes(reason),'reason is visibly labelled, not just a tooltip');
   await until(async()=>Boolean(await browser.evaluate('innerWidth===390&&innerHeight===844&&document.body.getBoundingClientRect().width===390')),'actual child dimensions acknowledge the single Mobile transition');
  const identity=await browser.evaluate('identity');
  await browser.restoreCamera({...fallback,mode:'manual',scale:.35,panX:0,panY:0});
  await browser.input([{type:'wheel',x:50,y:200,deltaX:0,deltaY:9000,modifiers:mods}]);
   await until(async()=>Boolean(await browser.evaluate('scrollY>0&&document.getElementById("footer").getBoundingClientRect().bottom<=innerHeight')),'native document scroll reveals final content in fallback');
   const point=await browser.evaluate('(()=>{const r=document.getElementById("footer").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()') as {x:number;y:number};
   // Child visibility alone does not qualify a native click: the fixed viewport
   // can still be cropped by the outer canvas. Arrange the camera before clicking.
   const footerInCanvas=()=>shell(browser,`(()=>{const f=document.getElementById('preview'),r=f.getBoundingClientRect(),c=document.getElementById('canvas').getBoundingClientRect(),p=${JSON.stringify(point)};const x=r.x+p.x*r.width/f.clientWidth,y=r.y+p.y*r.height/f.clientHeight;return {offset:y-(c.top+c.height/2),visible:x>c.left&&x<c.right&&y>c.top&&y<c.bottom&&x<innerWidth&&y<innerHeight&&document.elementFromPoint(x,y)===f}})()`);
   const camera=await browser.getCamera();assert.ok(camera);const panY=Number(camera.panY);assert.ok(Number.isFinite(panY));
   await browser.restoreCamera({...camera,panY:panY-(await footerInCanvas()).offset});
   await until(async()=>Boolean((await footerInCanvas()).visible),'footer is hit-testable in the main canvas, not just the child document');
   await browser.input([{type:'pointer',action:'down',...point,button:0,buttons:1,modifiers:mods},{type:'pointer',action:'up',...point,button:0,buttons:0,modifiers:mods}]);
  assert.equal(await browser.evaluate("document.getElementById('footer').dataset.clicked"),'yes','last document content is genuinely interactive');
  assert.equal(await browser.evaluate('identity'),identity,'transition safety does not require a retry or reload');
});});

test('qualified Mobile geometry classifies a known 9000px page against the 8192px bound',async()=>{await owned(async(browser,url)=>{
  assert.equal((await browser.open(url+'huge')).settled,true);
  await browser.resize(390,844);
   await until(async()=>Boolean(await browser.evaluate('innerWidth===390&&innerHeight===844&&document.body.getBoundingClientRect().width===390')),'qualify actual Mobile geometry before the one Page request');
  const before=await browser.evaluate('({id:identity,width:innerWidth,height:innerHeight,bodyWidth:document.body.getBoundingClientRect().width,mainHeight:document.querySelector("main").getBoundingClientRect().height,extent:document.documentElement.scrollHeight,ready:document.readyState})') as any;
  assert.deepEqual({width:before.width,height:before.height,bodyWidth:before.bodyWidth,mainHeight:before.mainHeight,extent:before.extent,ready:before.ready},{width:390,height:844,bodyWidth:390,mainHeight:9000,extent:9000,ready:'complete'});
  await (browser as any).setLayout('page','mobile');
  assert.deepEqual(browser.viewport(),{width:390,height:844});assert.equal((await browser.getCamera())?.layoutMode,'viewport');
  assert.match(String((await browser.getCamera())?.reason),/8192/);
  assert.equal(await browser.evaluate('identity'),before.id,'classification retains the qualified current document');
});});

test('content changes requalify; exact resize suspends sizing and capture failure restores layout',async()=>{await owned(async(browser,url)=>{
  await browser.open(url);assert.equal(typeof (browser as any).setLayout,'function');await (browser as any).setLayout('page','desktop');
  await browser.evaluate("document.querySelector('main').style.height='2000px'");
  await until(async()=>browser.viewport().height===2000&&(await browser.getCamera())?.layoutMode==='page','DOM/HMR-like content height is confirmed Page, not a temporary candidate');
  const prior=await browser.getCamera();await browser.resize(390,844);assert.equal((await browser.getCamera())?.layoutMode,'viewport');
  await browser.evaluate("document.querySelector('main').style.height='2200px'");
  await shell(browser,'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');assert.deepEqual(browser.viewport(),{width:390,height:844});
  await browser.restoreCamera(prior);assert.equal((await browser.getCamera())?.layoutMode,'page');assert.equal(browser.viewport().width,1280);
  const b=browser as any,send=b.cdp.send.bind(b.cdp),before=await browser.getCamera();b.cdp.send=(method:string,...args:any[])=>method==='Page.captureScreenshot'?Promise.reject(new Error('owned capture failure')):send(method,...args);
  try{await assert.rejects(browser.capture(),/owned capture failure/);}finally{b.cdp.send=send;}
  assert.deepEqual(await browser.getCamera(),before);
});});
