import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { createHash, randomBytes } from 'node:crypto';
import { createServer, request } from 'node:http';

const source = readFileSync(process.env.DS_CONTROLLER_SOURCE || new URL('../viewer-client/src/canvas-controller.js', import.meta.url), 'utf8');
const config = {url:'http://127.0.0.1:5173/',pages:[{id:'home',label:'Home',url:'http://127.0.0.1:5173/'},{id:'other',label:'Other',url:'http://127.0.0.1:5173/other'}],viewport:{width:1280,height:800}};
function environment(script = source.replace('export function ', 'function ') + ';initCanvas(initialConfig);', connected = true) {
  const nodes = new Map<string, any>(), events: Array<{owner:string,type:string,fn:Function}> = [], commands:any[] = [];
  let active:any;
  const make = (id:string) => {
    const node:any={id,hidden:false,dataset:{},style:{cssText:''},clientWidth:1000,clientHeight:720,children:[],classList:{add(){},remove(){}},
      getBoundingClientRect:()=>({x:0,y:0,left:0,top:0,width:id==='preview'?1280:1000,height:id==='preview'?800:720}),
      addEventListener:(type:string,fn:Function)=>events.push({owner:id,type,fn}),setAttribute(){},getAttribute:()=>'',removeAttribute(){},
      focus:()=>{active=node;},querySelector:()=>make('menu-item'),querySelectorAll:()=>[],replaceChildren(){},append(){},closest:()=>null,
      setPointerCapture(){},hasPointerCapture:()=>false,releasePointerCapture(){}};
    return node;
  };
  const $=(id:string)=>{if(!nodes.has(id))nodes.set(id,make(id));return nodes.get(id);};
  const document:any={getElementById:$,body:{style:{cssText:''}},documentElement:{},querySelectorAll:()=>[],createElement:()=>make('created'),
    addEventListener:(type:string,fn:Function)=>events.push({owner:'document',type,fn}),get activeElement(){return active;}};
  const window:any={addEventListener:(type:string,fn:Function)=>events.push({owner:'window',type,fn})};
  if(connected)window.__dsCanvasSend=(value:string)=>commands.push(JSON.parse(value));
  const context:any={initialConfig:JSON.parse(JSON.stringify(config)),window,document,URL,Error,Number,Math,JSON,Object,Set,
    getComputedStyle:()=>({getPropertyValue:(name:string)=>name==='--s7'?'48px':'32px'}),
    clearTimeout(){},setTimeout:()=>1,requestAnimationFrame:(fn:Function)=>fn(),ResizeObserver:class {observe(){}}};
  runInNewContext(script,context);
  return {window,document,nodes,$,commands,events,api:window.__dsCanvas,bridge:window.__dsToolbarBridge};
}

test('canvas is exposed before React, readiness waits for mounted hooks, absent binding stays pending',()=>{
  const e=environment(undefined,false);
  assert.ok(e.api&&e.bridge);assert.equal(e.commands.length,0);
  assert.equal(e.bridge.getSnapshot().statusState,'loading');assert.equal(e.$('camera').hidden,false);
  assert.equal(e.window.__dsToolbarMounted(),false);assert.equal(e.bridge.getSnapshot().statusState,'loading');
  e.window.__dsCanvasSend=(value:string)=>e.commands.push(JSON.parse(value));
  assert.equal(e.window.__dsToolbarMounted(),true);assert.equal(e.window.__dsToolbarMounted(),true);
  assert.deepEqual(e.commands,[{type:'ready'}]);
});

test('snapshots are immutable and cached; an action publishes once and sends once; unsubscribe removes ownership',()=>{
  const e=environment();e.api.setStatus({state:'ready'});
  const initial=e.bridge.getSnapshot();assert.strictEqual(initial,e.bridge.getSnapshot());assert.ok(Object.isFrozen(initial));assert.ok(Object.isFrozen(initial.pages[0]));
  let count=0;const unsubscribe=e.bridge.subscribe(()=>count++);
  e.api.setStatus({state:'ready'});assert.equal(count,0);assert.strictEqual(initial,e.bridge.getSnapshot());
  e.bridge.selectPreset('mobile');assert.equal(count,1);assert.deepEqual(e.commands,[{type:'layout',mode:'page',preset:'mobile'}]);assert.equal(e.bridge.getSnapshot().width,390);
  e.bridge.selectPreset('mobile');assert.equal(count,1,'unchanged values cannot invalidate useSyncExternalStore');
  unsubscribe();e.bridge.togglePan();assert.equal(count,1);
});

test('controller never mutates stock toolbar children or installs menu keyboard/click handlers',()=>{
  const e=environment();
  for(const id of ['pages','zoom','minus','plus','pan','page-name','page-static','page-menu','zoom-menu']){
    const node=e.$(id);for(const key of ['textContent','disabled','onclick','onkeydown'])Object.defineProperty(node,key,{set(){throw new Error('imperative stock node mutation: '+id+'.'+key);}});
  }
  e.api.setStatus({state:'ready'});e.bridge.setMenu('zoom');e.bridge.zoomTo(1);e.bridge.togglePan();e.bridge.panBy('right');e.bridge.selectPage('other');e.api.setPage({url:config.url,title:'Confirmed',navigate:false});
  assert.equal(e.events.filter(x=>x.owner==='canvas'&&x.type==='wheel').length,1);
  assert.equal(e.events.filter(x=>x.owner==='document'&&x.type==='keydown').length,2,'capture blocker and one root shortcut path only');
  assert.equal(e.commands.filter(x=>x.type==='page').length,1);
});

test('capture locks bridge actions and preserves camera, open menu and pan; queued status applies after restore',async()=>{
  const e=environment();e.api.setStatus({state:'ready'});e.bridge.zoomTo(1);e.bridge.togglePan();e.bridge.setMenu('zoom');
  const camera=JSON.stringify(e.api.getCamera()), token=e.api.beginCapture();
  assert.equal(e.bridge.getSnapshot().capturing,true);
  assert.equal(e.api.setViewport(390,844),false);assert.equal(e.api.zoomCamera({action:'out'}),false);
  e.bridge.setMenu(null);e.bridge.togglePan();e.bridge.selectPage('other');e.bridge.selectPreset('mobile');e.bridge.panBy('left');e.bridge.retry();
  assert.equal(JSON.stringify(e.api.getCamera()),camera);assert.equal(e.bridge.getSnapshot().openMenu,'zoom');assert.equal(e.commands.length,0);
  const rect=await e.api.normalizeCapture(token);assert.ok([rect.x,rect.y,rect.width,rect.height].every(Number.isFinite));assert.ok(rect.width>0&&rect.height>0);
  assert.equal(e.api.endCapture(token+1),false);assert.equal(e.api.endCapture(token),true);
  assert.equal(JSON.stringify(e.api.getCamera()),camera);assert.equal(e.bridge.getSnapshot().openMenu,'zoom');assert.equal(e.bridge.getSnapshot().pan,true);
  const next=e.api.beginCapture();e.api.setStatus({state:'error',message:'Confirmed failure'});assert.equal(e.bridge.getSnapshot().statusState,'ready');e.api.endCapture(next);
  assert.equal(e.bridge.getSnapshot().statusState,'error');assert.equal(e.bridge.getSnapshot().message,'Confirmed failure');assert.equal(e.$('camera').hidden,true);
});

test('invalid metadata and geometry cannot poison the snapshot; metadata-only confirmation never reloads',()=>{
  const e=environment();e.api.setStatus({state:'ready'});const before=e.bridge.getSnapshot();
  for(const width of [NaN,Infinity,0,8193])assert.equal(e.api.setViewport(width,800),false);
  assert.equal(e.api.setPage({url:'javascript:alert(1)'}),false);e.api.setStatus({state:'ready'});
  const src=e.$('preview').src;e.api.setPage({url:config.url+'#confirmed',title:'Confirmed',navigate:false});assert.equal(e.$('preview').src,src);
  assert.equal(e.bridge.getSnapshot().currentTitle,'Confirmed');assert.equal(e.bridge.getSnapshot().ready,true);
  e.api.setPage({url:config.url,pages:[{id:'duplicate',label:'A',url:config.url},{id:'duplicate',label:'B',url:config.url}]});
  assert.deepEqual(JSON.parse(JSON.stringify(e.bridge.getSnapshot().pages)),JSON.parse(JSON.stringify(before.pages)));
});

test('extracted camera math remains byte-for-byte original; characterize original and new outputs',()=>{
  const original=readFileSync(new URL('./fixtures/stock-controller.original-viewer-ui.txt',import.meta.url),'utf8');
  const oldScript=original.match(/const VIEWER_SCRIPT = String.raw`([\s\S]*)`;/)![1]!;
  for(const name of ['getFitBounds','setLayout','zoomTo','zoomCamera','cameraShortcut','normalizeCapture']){
    const regex=new RegExp(`(?:async )?function ${name}\\([^)]*\\)\\{[\\s\\S]*?\\n  \\}`);
    assert.equal(source.match(regex)?.[0],oldScript.match(regex)?.[0],name+' algorithm is not part of this extraction');
  }
  const old=environment(oldScript),current=environment();
  for(const e of [old,current]){
    e.api.setStatus({state:'ready'});e.api.setLayout({mode:'page',preset:'desktop',width:1280,height:1880,nominalHeight:800});
    e.api.zoomCamera({action:'wheel',deltaY:-40,x:210,y:170});e.api.handleCanvasInput({type:'wheel',deltaX:19,deltaY:31,x:20,y:40});
  }
  assert.equal(JSON.stringify(current.api.getCamera()),JSON.stringify(old.api.getCamera()));
  assert.equal(current.$('camera').style.transform,old.$('camera').style.transform);
});

function renderer(){
  // Source-only serialization proof: private sentinel assets, not generated or
  // production assets. Canonical client build/render remains the primary gate.
  const ui=readFileSync(process.env.DS_VIEWER_UI_SOURCE || new URL('../service/viewer-ui.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export function renderViewerHtml','function renderViewerHtml');
  const controller=runInNewContext(source.replace('export function ','function ')+';initCanvas');
  return runInNewContext(stripTypeScriptTypes(ui)+';renderViewerHtml',{URL,Set,JSON,initCanvas:controller,
    VIEWER_CLIENT_CSS:':root{}',VIEWER_CLIENT_JS:'window.__sentinel="</script>\u2028\u2029";'});
}

test('HTML allowlist escapes config and compiled script data, exposes controller before one compiled entry',()=>{
  const render=renderer(),hostile='</script><img src=x onerror=alert(1)>\u2028\u2029';
  const html=render({...config,pages:[{id:hostile,label:hostile,url:config.url}],bearer:'NEVER-SERIALIZE'});
  assert.doesNotMatch(html,/<img src=x|NEVER-SERIALIZE|--nova-|Iowan|design-tokens|<script[^>]+src=/);
  const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];assert.equal(scripts.length,2);
  assert.match(scripts[0][1],/window\.__dsViewerConfig=/);assert.match(scripts[1][1],/__sentinel/);
  const e=environment(scripts[0][1],false);assert.ok(e.bridge&&e.api);assert.equal(e.$('preview').src,config.url);
  assert.equal(e.bridge.getSnapshot().pages[0].label,hostile);assert.equal(e.$('camera').hidden,false);
  const sandbox:any={window:{}};runInNewContext(scripts[1][1],sandbox);assert.equal(sandbox.window.__sentinel,'</script>\u2028\u2029');
  assert.throws(()=>render({...config,url:'https://user:secret@example.com/'}));assert.throws(()=>render({...config,viewport:{width:Infinity,height:800}}));
});

test('server hashes the exact two script bodies and permits only data fonts without widening authority',async()=>{
  const server=readFileSync(process.env.DS_SERVER_SOURCE || new URL('../service/viewer-server.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export async function startViewerServer','async function startViewerServer');
  const start=runInNewContext(stripTypeScriptTypes(server)+';startViewerServer',{createServer,createHash,randomBytes,renderViewerHtml:renderer(),Promise});
  const running=await start(config);
  try{
    const response=await fetch(running.url),html=await response.text(),csp=response.headers.get('content-security-policy')!;
    assert.equal(response.status,200);assert.match(csp,/font-src data:/);assert.match(csp,/connect-src 'none'/);assert.match(csp,/img-src 'none'/);assert.match(csp,/frame-src http: https:/);
    const hashes=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>"'sha256-"+createHash('sha256').update(m[1]!).digest('base64')+"'");
    assert.equal(hashes.length,2);assert.equal(csp.match(/script-src ([^;]+)/)![1],hashes.join(' '));assert.doesNotMatch(csp,/unsafe-eval|script-src[^;]*unsafe-inline|font-src[^;]*https?:/);
    assert.equal(response.headers.get('referrer-policy'),'no-referrer');assert.equal((await fetch(running.url+'x')).status,404);
    assert.equal((await fetch(running.url,{method:'POST'})).status,405);
    // Native fetch normalizes Host: use an actual raw HTTP request for this gate.
    const invalidHost=await new Promise<number|undefined>((resolve,reject)=>{const req=request(running.url,{headers:{Host:'invalid.example'}},res=>{res.resume();res.once('end',()=>resolve(res.statusCode));});req.once('error',reject);req.end();});
    assert.equal(invalidHost,403);
  }finally{await running.close();}
});
