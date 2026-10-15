import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {cp,mkdir,mkdtemp,readFile,writeFile,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const root=fileURLToPath(new URL('../',import.meta.url));
const original=process.env.FIT_BREAKER_ORIGINAL;
const sourceRoot=original||root;
const scratch=await mkdtemp(path.join(tmpdir(),'fit-page-breaker-'));
await mkdir(path.join(scratch,'service'));await mkdir(path.join(scratch,'viewer-client/src'),{recursive:true});
for(const file of ['browser','artifact-context','viewer-server','viewer-ui'])await cp(path.join(sourceRoot,'service',file+'.ts'),path.join(scratch,'service',file+'.ts'));
await cp(path.join(sourceRoot,'shared'),path.join(scratch,'shared'),{recursive:true});
// The stock controller and the compiled asset module are real imports of
// viewer-ui.ts; copy both so the scratch tree resolves (assets are inert
// strings under a Node import).
await cp(path.join(sourceRoot,'viewer-client/src/canvas-controller.js'),path.join(scratch,'viewer-client/src/canvas-controller.js'));
await cp(path.join(sourceRoot,'viewer-client/src/canvas-controller.d.ts'),path.join(scratch,'viewer-client/src/canvas-controller.d.ts'));
await cp(path.join(sourceRoot,'service/viewer-assets.generated.ts'),path.join(scratch,'service/viewer-assets.generated.ts'));
await symlink(path.join(root,'node_modules'),path.join(scratch,'node_modules'));
let browserSource=await readFile(path.join(scratch,'service/browser.ts'),'utf8');
const mutant=process.env.FIT_BREAKER_MUTANT;
function replaceOnce(from:string,to:string){assert.equal(browserSource.split(from).length-1,1,'one functional fault mutation match');browserSource=browserSource.replace(from,to);}
if(mutant==='height-growth')replaceOnce('second.extent>candidate+1','false');
else if(mutant==='stale-first-width')replaceOnce('const first=await measure();if(!first)return;',"const first=await measure();if(!first)return;if(preset==='mobile')first.width=1280; /* scratch: stale old-width measurement */");
else if(mutant==='numeric-mode-suspension')replaceOnce("if(supportsLayout)await this.applyLayout({mode:'viewport',preset:'custom',nominalHeight:height},width,height,", "if(supportsLayout)await this.applyLayout({mode:'page',preset:'desktop',nominalHeight:height},width,height,");
else if(mutant==='capture-renderer-finally')replaceOnce('await this.shellEval(`__dsCanvas.endCapture(${JSON.stringify(token)})`);','/* scratch functional fault: renderer transaction remains frozen */');
else assert.equal(mutant,undefined,'known functional mutant');
await writeFile(path.join(scratch,'service/browser.ts'),browserSource);
const {Browser}=await import(pathToFileURL(path.join(scratch,'service/browser.ts')).href) as typeof import('../service/browser.ts');
const mods={alt:false,ctrl:false,meta:false,shift:false};
async function shell(browser:InstanceType<typeof Browser>,expression:string):Promise<any>{const b=browser as any;const r=await b.cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},b.sessionId);if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
async function frames(browser:InstanceType<typeof Browser>){await shell(browser,'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');await browser.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');}
async function bounded(check:()=>Promise<boolean>,message:string){const end=Date.now()+3000;while(Date.now()<end){if(await check())return;await new Promise(resolve=>setTimeout(resolve,10));}assert.fail(message);}
async function owned(run:(browser:InstanceType<typeof Browser>,url:string)=>Promise<void>){
  const app=createServer((req,res)=>{const style=req.url==='/vh'?'height:100vh':'height:1880px';res.writeHead(200,{'content-type':'text/html','cache-control':'no-store'});res.end(`<!doctype html><title>Finite functional fixture</title><style>html,body{margin:0}main{${style};position:relative}input{width:120px;height:30px}button{width:120px;height:40px}#footer{position:absolute;bottom:0}#hidden{display:none;height:77777px}</style><main><input id=nonce><button id=first onclick="window.clicks++">First</button><button id=footer>Footer</button><div id=hidden>Hidden negative control</div></main>${req.url==='/vh'?'<div style="height:1280px"></div>':''}<script>window.identity=crypto.randomUUID();window.clicks=0;window.receipts=[];document.addEventListener('click',e=>receipts.push({id:e.target.id,trusted:e.isTrusted}));</script>`);});
  await new Promise<void>(resolve=>app.listen(0,'127.0.0.1',resolve));const a=app.address();assert.ok(a&&typeof a==='object');const prior=process.env.DS_WINDOW;process.env.DS_WINDOW='-2400,-2400,820,650';const browser=new Browser();if(prior===undefined)delete process.env.DS_WINDOW;else process.env.DS_WINDOW=prior;
  try{const url=`http://localhost:${a.port}/`;assert.equal((await browser.open(url)).settled,true);await frames(browser);await run(browser,url);}
  finally{await browser.close();app.closeAllConnections();await new Promise<void>(resolve=>app.close(()=>resolve()));console.info('owned-cleanup',{serverClosed:!app.listening,browserOpen:(await browser.state()).windowOpen});}
}
async function geometry(browser:InstanceType<typeof Browser>){return await browser.evaluate("({width:innerWidth,height:innerHeight,extent:document.querySelector('main').getBoundingClientRect().height,hiddenWidth:document.getElementById('hidden').getBoundingClientRect().width,id:identity})") as any;}
async function select(browser:InstanceType<typeof Browser>,preset:string){const b=browser as any;const receipt=new Promise<void>(resolve=>{const off=b.cdp.on('Runtime.bindingCalled',(p:any)=>{if(p.name==='__dsCanvasSend'){try{const value=JSON.parse(p.payload);if(value.type==='layout'&&value.preset===preset){off();resolve();}}catch{}}});});const p=await shell(browser,`(()=>{const b=document.querySelector('[data-preset="${preset}"]'),r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,disabled:b.disabled}})()`);assert.equal(p.disabled,false);for(const type of ['mousePressed','mouseReleased'])await b.cdp.send('Input.dispatchMouseEvent',{type,x:p.x,y:p.y,button:'left',buttons:type==='mousePressed'?1:0,clickCount:1},b.sessionId);await receipt;await b.operationTail;await frames(browser);}

test('F1 first Mobile after Fit and feedback fallback qualifies finite 1880 page',{timeout:30000},async()=>{await owned(async(browser,url)=>{
  const start=await geometry(browser);assert.deepEqual({width:start.width,extent:start.extent,hiddenWidth:start.hiddenWidth},{width:1280,extent:1880,hiddenWidth:0});assert.ok(Number.isFinite(start.extent));
  await browser.setLayout('fit','fit');await frames(browser);
  await browser.placeWindow(-2400,-2400,620,480);await bounded(async()=>{const fit=await shell(browser,'__dsCanvas.getFitBounds()');return browser.viewport().width===fit.width&&browser.viewport().height===fit.height;},'Fit acknowledges actual resized content bounds before switch');
  await browser.navigate(url+'vh');await browser.setLayout('page','desktop');await browser.navigate(url+'finite');await frames(browser);
  const selected=await geometry(browser);assert.equal(selected.extent,1880,'new target independently has finite 1880px CSS extent');assert.equal(selected.hiddenWidth,0);
  const b=browser as any,contexts=b.contexts,evaluate=contexts.evaluate.bind(contexts),measurements:any[]=[];
  contexts.evaluate=async(context:any,expression:string,...args:any[])=>{const value=await evaluate(context,expression,...args);if(expression.includes('extent:Math.max'))measurements.push({value,generation:b.layoutGeneration,parent:await shell(browser,"(()=>{const f=document.getElementById('preview');return {width:f.clientWidth,height:f.clientHeight}})()")});return value;};
  try{await browser.setLayout('page','mobile');await frames(browser);}finally{contexts.evaluate=evaluate;}
  const after=await geometry(browser),camera=await browser.getCamera(),actual=browser.viewport();
  console.info('F1 evidence:',JSON.stringify({start,selected,measurements,after,camera,actual}));
  assert.equal(after.id,selected.id,'same target doc qualified; no reload/second Mobile selection was used');assert.deepEqual({mode:camera?.layoutMode,width:actual.width,height:actual.height},{mode:'page',width:390,height:1880},'finite compatible first selection must not fall back to nominal 844');
});});

test('F2 viewport-dependent height falls back once instead of a ResizeObserver growth loop',{timeout:30000},async()=>{await owned(async(browser,url)=>{
  await browser.navigate(url+'vh');await frames(browser);const b=browser as any,contexts=b.contexts,evaluate=contexts.evaluate.bind(contexts);let measures=0;
  contexts.evaluate=async(c:any,e:string,...args:any[])=>{if(e.includes('extent:Math.max'))measures++;return evaluate(c,e,...args);};
  try{await browser.setLayout('page','desktop');await frames(browser);await b.operationTail;}finally{contexts.evaluate=evaluate;}
  const camera=await browser.getCamera();console.info('F2 evidence:',JSON.stringify({viewport:browser.viewport(),camera,measures}));
  assert.deepEqual({mode:camera?.layoutMode,height:browser.viewport().height},{mode:'viewport',height:800},'100vh plus fixed tail cannot be accepted as a stable expanded Page');assert.ok(measures<=4,'bounded measurement rather than unbounded RO growth');
});});

test('F3 numeric 601x777 resize suspends Page growth and conserves typed document nonce',{timeout:30000},async()=>{await owned(async(browser)=>{
  await browser.setLayout('page','desktop');await browser.evaluate("document.getElementById('nonce').value='typed-exact-601';document.querySelector('main').style.height='2000px'");await bounded(async()=>browser.viewport().height===2000,'2000px content acknowledgement');
  const id=await browser.evaluate('identity');await browser.resize(601,777);await frames(browser);await browser.evaluate("document.querySelector('main').style.height='2200px'");await frames(browser);await (browser as any).operationTail;
  const actual=await geometry(browser),camera=await browser.getCamera(),nonce=await browser.evaluate("document.getElementById('nonce').value");console.info('F3 evidence:',JSON.stringify({actual,camera,nonce}));
  assert.deepEqual({width:actual.width,height:actual.height,mode:camera?.layoutMode,id:actual.id,nonce},{width:601,height:777,mode:'viewport',id,nonce:'typed-exact-601'},'exact agent viewport must not resume automatic Page qualification');
});});

test('F4 early capture failure restores Page camera and releases queue for exact numeric resize',{timeout:30000},async()=>{await owned(async(browser)=>{
  await browser.setLayout('page','desktop');const prior=await browser.getCamera();assert.equal(prior?.layoutMode,'page');await browser.restoreCamera({...prior,mode:'manual',scale:.35,panX:7,panY:2});const before=await browser.getCamera(),id=await browser.evaluate('identity');
  const b=browser as any,send=b.cdp.send.bind(b.cdp);let failed=false;b.cdp.send=(method:string,...args:any[])=>{if(method==='Emulation.setDeviceMetricsOverride'&&!failed){failed=true;return Promise.reject(new Error('owned early capture metrics failure'));}return send(method,...args);};try{await assert.rejects(browser.capture(),/owned early capture metrics failure/);}finally{b.cdp.send=send;}
  const restored=await browser.getCamera(),active=await shell(browser,'__dsCaptureActive');console.info('F4 evidence:',JSON.stringify({sameCamera:JSON.stringify(before)===JSON.stringify(restored),active,sameDoc:id===await browser.evaluate('identity')}));assert.deepEqual({restored,active},{restored:before,active:false},'failure before clip must release renderer capture transaction and preserve Page camera');
  await browser.resize(601,777);assert.deepEqual(browser.viewport(),{width:601,height:777},'queue remains usable after capture failure');
});});
