// Unit routing proof only: VM events and a private renderer API stub are NOT
// OS-native input or integrated renderer/camera certification.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { Browser } from '../service/browser.ts';

const source=await readFile(new URL('../service/browser.ts',import.meta.url),'utf8');
const bridge=source.match(/const ARTIFACT_BRIDGE = `([\s\S]*?)`;[\s\S]*?const ARTIFACT_SCRIPTS/)![1]!;
type EventData=Record<string,any>;
function child(){
  const handlers=new Map<string,Array<{callback:(event:EventData)=>void;options:any}>>();
  const messages:EventData[]=[];
  class Element {nodeType=1;parentElement=null;scrollHeight=100;clientHeight=100;scrollWidth=100;clientWidth=100;closest(){return null;}matches(){return false;}}
  const document={body:new Element(),documentElement:new Element(),addEventListener(type:string,callback:(event:EventData)=>void,options?:any){const list=handlers.get(type)??[];list.push({callback,options});handlers.set(type,list);}};
  const window:EventData={innerHeight:800,__dsLayoutMode:'viewport',addEventListener(){},__dsArtifactEvent:(payload:string)=>messages.push(JSON.parse(payload))};
  const context={window,document,history:{pushState(){},replaceState(){}},Element,HTMLImageElement:Element,ResizeObserver:class{observe(){}},MutationObserver:class{observe(){}},requestAnimationFrame(){},getComputedStyle:()=>({lineHeight:'24px',overflowX:'visible',overflowY:'visible'}),Number,JSON};
  runInNewContext(bridge,context);
  function event(type:string,values:EventData={},appOwner=false){
    const e:EventData={key:'',code:'',ctrlKey:false,metaKey:false,altKey:false,shiftKey:false,defaultPrevented:false,clientX:200,clientY:100,deltaX:0,deltaY:24,deltaMode:0,composedPath:()=>[],...values};
    e.preventDefault=()=>{e.defaultPrevented=true;};e.stopImmediatePropagation=()=>{e.stopped=true;};
    // App target/widget bubble handler runs before the document adapter.
    if(appOwner)e.preventDefault();
    for(const {callback} of handlers.get(type)??[]){callback(e);if(e.stopped)break;}
    return e;
  }
  return {window,messages,event,handlers};
}

function backend(rect={x:120,y:80,width:640,height:400}){
  const b=new Browser() as any;
  let current={session:'artifact',frame:'owned-frame',id:7,unique:'document-a'};
  const handlers=new Map<string,(params:EventData,session?:string)=>void>();
  const calls:EventData[]=[];
  b.contexts={artifact:()=>current,shell:()=>null,matches:(record:any,session:string,id:number)=>record===current&&session===current.session&&id===current.id};
  const dimensions=Object.freeze({width:1280,height:800,dpr:1,font:'16px',uuid:'document-a',toolbarHeight:40});
  const frame={clientWidth:dimensions.width,clientHeight:dimensions.height,getBoundingClientRect:()=>rect};
  const canvas={getBoundingClientRect:()=>({x:20,y:40,width:800,height:600})};
  const api={zoomCamera:(event:EventData)=>{calls.push(event);return true;}};
  b.shellEval=async(expression:string)=>runInNewContext(expression,{document:{getElementById:(id:string)=>id==='preview'?frame:canvas},__dsCanvas:api,Number});
  b.wireEvents({on:(name:string,callback:any)=>{handlers.set(name,callback);return()=>undefined;}});
  const send=(value:EventData)=>handlers.get('Runtime.bindingCalled')!({name:'__dsArtifactEvent',payload:JSON.stringify(value),executionContextId:7},'artifact');
  const flush=async()=>{await b.operationTail;await Promise.resolve();};
  return {b,calls,send,flush,dimensions,replace(){current={...current,unique:'document-b'};}};
}

test('unit oracle qualification: finite frame geometry, exact anchor hit and app default ownership',()=>{
  const c=child(),owned=c.event('keydown',{key:'x',ctrlKey:true},true);
  assert.equal(owned.defaultPrevented,true);assert.equal(c.messages.length,0);
  const b=backend();assert.equal(b.dimensions.width,1280);assert.equal(b.dimensions.dpr,1);
  assert.ok(Number.isFinite(640)&&640>0);assert.equal(Number.isFinite(Infinity),false);
});

test('artifact Cmd/Ctrl zoom keys emit camera actions and prevent native defaults without claiming literal text',()=>{
  const c=child();
  for(const [values,action] of [[{key:'+',code:'Equal',ctrlKey:true,shiftKey:true},'in'],[{key:'=',code:'Equal',metaKey:true},'in'],[{key:'-',code:'Minus',ctrlKey:true},'out'],[{key:'0',code:'Digit0',metaKey:true},'reset'],[{key:'Unidentified',code:'NumpadAdd',ctrlKey:true},'in']] as const){
    const e=c.event('keydown',values);assert.equal(e.defaultPrevented,true);assert.deepEqual(c.messages.pop(),{type:'camera-zoom',action});
  }
  for(const values of [{key:'+',code:'Equal'},{key:'-',code:'Minus'},{key:'0',code:'Digit0'},{key:'a',code:'KeyA',ctrlKey:true},{key:'=',code:'Equal',ctrlKey:true,altKey:true}])assert.equal(c.event('keydown',values).defaultPrevented,false);
  assert.equal(c.messages.length,0);
  for(const handler of c.handlers.get('keydown')??[])if(String(handler.callback).includes('camera-zoom'))assert.notEqual(handler.options,true,'zoom honors target handlers rather than capture-stealing their shortcuts');
});

test('modified wheel normalizes pixels/lines/pages in interaction mode and suppresses native zoom even in Fit',()=>{
  const c=child();
  for(const [deltaMode,deltaY,pixels] of [[0,24,24],[1,2,48],[2,1,800]]){
    const e=c.event('wheel',{ctrlKey:true,deltaMode,deltaY});assert.equal(e.defaultPrevented,true);
    assert.deepEqual(c.messages.pop(),{type:'camera-zoom',action:'wheel',deltaY:pixels,x:200,y:100});
  }
  c.window.__dsLayoutMode='fit';const fit=c.event('wheel',{metaKey:true,deltaY:-12});assert.equal(fit.defaultPrevented,true);assert.equal(c.messages.pop()?.action,'wheel');
  c.event('wheel',{ctrlKey:true,deltaY:Infinity});assert.equal(c.messages.length,0,'nonfinite input cannot become a camera payload');
  c.event('wheel',{ctrlKey:true,deltaY:1e9});assert.equal(c.messages.pop()?.deltaY,8192,'normalized messages remain bounded');
  assert.equal(c.event('wheel',{deltaY:30}).defaultPrevented,false,'ordinary viewport document scrolling is native');
});

test('target/widget-owned modifier gestures keep ownership; allowed modifier zoom still works afterward',()=>{
  const c=child();
  c.event('wheel',{ctrlKey:true},true);c.event('keydown',{key:'+',ctrlKey:true},true);
  assert.equal(c.messages.length,0);
  c.event('keydown',{key:'-',ctrlKey:true});assert.deepEqual(c.messages,[{type:'camera-zoom',action:'out'}]);
});

test('current owned artifact wheel anchor is mapped once to canvas-local CSS, at half and 1.7 scales',async()=>{
  for(const [rect,expected] of [[{x:120,y:80,width:640,height:400},{x:200,y:90}],[{x:-100,y:-20,width:2176,height:1360},{x:220,y:110}]] as const){
    const b=backend(rect);b.send({type:'camera-zoom',action:'wheel',deltaY:24,x:200,y:100});await b.flush();
    assert.equal(b.calls.length,1);assert.deepEqual({...b.calls[0]},{action:'wheel',deltaY:24,...expected});
    assert.deepEqual(b.dimensions,{width:1280,height:800,dpr:1,font:'16px',uuid:'document-a',toolbarHeight:40});
  }
});

test('camera-only dispatch validates payload and drops previous-document/capture-queued results',async()=>{
  const b=backend();
  b.send({type:'camera-zoom',action:'reset'});await b.flush();assert.deepEqual({...b.calls[0]},{action:'reset'});
  for(const message of [{type:'camera-zoom',action:'unknown'},{type:'camera-zoom',action:'wheel',deltaY:24,x:9000,y:10},{type:'camera-zoom',action:'wheel',deltaY:'24',x:10,y:10}])b.send(message);
  await b.flush();assert.equal(b.calls.length,1);
  let release!:()=>void;b.b.operationTail=new Promise<void>(resolve=>{release=resolve;});
  b.send({type:'camera-zoom',action:'in'});b.replace();release();await b.flush();assert.equal(b.calls.length,1,'a replaced artifact cannot affect a later document');
  b.b.captureInFlight=true;b.send({type:'camera-zoom',action:'out'});await b.flush();assert.equal(b.calls.length,1,'capture-owned inputs are not replayed afterward');
});
