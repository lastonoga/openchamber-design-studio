import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ArtifactContexts } from '../service/artifact-context.ts';

function fixture() {
  const handlers=new Map<string,Array<(params:Record<string,unknown>,session?:string)=>void>>();
  const trusted='http://127.0.0.1:32123/canvas/private-capability';
  let url=trusted;
  const cdp={on:(method:string,handler:(params:Record<string,unknown>,session?:string)=>void)=>{
    const list=handlers.get(method)??[];list.push(handler);handlers.set(method,list);return ()=>undefined;
  },send:async(method:string):Promise<Record<string,unknown>>=>method==='Page.getFrameTree'?{frameTree:{frame:{id:'root',url}}}:{} };
  const contexts=new ArtifactContexts(cdp,'main','true',()=>undefined,trusted);
  const emit=(method:string,params:Record<string,unknown>)=>{for(const fn of handlers.get(method)??[])fn(params,'main');};
  const create=(unique:string,origin=new URL(trusted).origin)=>emit('Runtime.executionContextCreated',{context:{id:1,uniqueId:unique,origin,auxData:{isDefault:true,frameId:'root'}}});
  return {contexts,emit,create,setUrl:(next:string)=>{url=next;},trusted};
}

test('shell leases reject pending discovery, wrong capability and same-ID replacement', async()=>{
  const f=fixture();f.create('original');await f.contexts.discover();
  const current=f.contexts.shell();assert.ok(current);
  const lease=f.contexts.captureShellAuthority('main',1);assert.ok(lease);
  assert.equal(f.contexts.shellAuthorityCurrent(lease),true);
  f.create('replacement');
  assert.equal(f.contexts.shell(),null,'authorization fails closed during asynchronous discovery');
  assert.equal(f.contexts.matches(current,'main',1),false,'map-key reuse cannot preserve an old context record');
  await f.contexts.discover();
  assert.equal(f.contexts.shellAuthorityCurrent(lease),false,'queued old-context side effects are revoked');
  f.setUrl(f.trusted+'-wrong');
  f.emit('Page.frameNavigated',{frame:{id:'root',url:f.trusted+'-wrong'}});
  assert.equal(f.contexts.captureShellAuthority('main',1),null,'navigation revokes synchronously');
  await f.contexts.discover();
  assert.equal(f.contexts.shell(),null,'same origin with wrong capability has no authority');
});

test('shell leases reject an attacker origin, destruction and close',async()=>{
  const f=fixture();f.create('attacker','http://attacker.invalid');await f.contexts.discover();
  assert.equal(f.contexts.shell(),null);
  f.create('legitimate');await f.contexts.discover();
  const lease=f.contexts.captureShellAuthority('main',1);assert.ok(lease);
  f.emit('Runtime.executionContextDestroyed',{executionContextId:1});
  assert.equal(f.contexts.shellAuthorityCurrent(lease),false);
  f.create('new-legitimate');await f.contexts.discover();
  const fresh=f.contexts.captureShellAuthority('main',1);assert.ok(fresh);
  f.contexts.close();assert.equal(f.contexts.shellAuthorityCurrent(fresh),false);
});
