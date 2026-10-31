import test from 'node:test';
import assert from 'node:assert/strict';
import {createSyncClient} from '../web/sync-client.js';
import {safeProtonLoginURL,syncPresentation} from '../web/sync-ui.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
function fixture(overrides={}) {
  const state={revision:1,generation:0,ready:true,dirty:false,saving:false,conflict:false};
  let clock=5000;const applied=[],leases=[],errors=[];
  const client=createSyncClient({client:'test-client',getState:()=>state,now:()=>clock,fetchRevision:async()=>({revision:2}),fetchState:async()=>({revision:2,data:{version:1,pages:[]}}),sendActivity:async body=>leases.push(body),applyRemote:incoming=>{applied.push(incoming);state.revision=incoming.revision;state.generation++;return true;},onError:error=>errors.push(error),...overrides});
  return {client,state,applied,leases,errors,advance(ms){clock+=ms;}};
}
test('a clean browser follows one new revision exactly once',async()=>{
  const f=fixture();assert.equal(await f.client.poll(),true);assert.equal(await f.client.poll(),false);assert.equal(f.applied.length,1);assert.equal(f.state.revision,2);
});
test('dirty edits, saves in flight and conflicts all prevent replacement',async()=>{
  for(const key of ['dirty','saving','conflict']){const f=fixture();f.state[key]=true;assert.equal(await f.client.poll(),false,key);assert.equal(f.applied.length,0);assert.equal(f.leases[0].busy,true);}
});
test('first load is leased and never refreshes an uninitialized graph',async()=>{
  const f=fixture({fetchRevision:()=>{throw Error('must not fetch');}});f.state.ready=false;assert.equal(await f.client.poll(),false);assert.deepEqual(f.errors,[]);assert.equal(f.leases[0].busy,true);
});
test('typing during revision request defers refresh even if graph not dirty yet',async()=>{
  const revision=deferred();let fetched=0;const f=fixture({fetchRevision:()=>revision.promise,fetchState:async()=>{fetched++;return {revision:2};}});
  const polling=f.client.poll();f.client.touch();revision.resolve({revision:2});assert.equal(await polling,false);assert.equal(fetched,0);f.advance(1600);assert.equal(await f.client.poll(),true);
});
test('typing or saving during state download cannot replace local text',async()=>{
  for(const action of ['touch','generation','saving','revision']){
    const incoming=deferred(),started=deferred();const f=fixture({fetchState:()=>{started.resolve();return incoming.promise;}});
    const polling=f.client.poll();await started.promise;
    if(action==='touch')f.client.touch();else if(action==='saving')f.state.saving=true;else f.state[action]++;
    incoming.resolve({revision:2,data:{}});assert.equal(await polling,false,action);assert.equal(f.applied.length,0);
  }
});
test('busy transitions are delivered in order when network responses are delayed',async()=>{
  const sent=[],first=deferred();const f=fixture({sendActivity:body=>{sent.push(body.busy);return sent.length===1?first.promise:Promise.resolve();}});
  f.client.activity();f.client.touch();assert.deepEqual(sent,[false]);first.resolve();await Promise.resolve();await Promise.resolve();assert.deepEqual(sent,[false,true]);
  f.advance(1600);f.client.activity();await Promise.resolve();assert.deepEqual(sent,[false,true,false]);
});
test('busy lease is renewed while a poll is in flight',async()=>{
  const revision=deferred();const f=fixture({fetchRevision:()=>revision.promise});f.state.dirty=true;
  const polling=f.client.poll();f.advance(2000);await f.client.poll();assert.equal(f.leases.length,2);assert.ok(f.leases.every(body=>body.busy));revision.resolve({revision:2});await polling;
});
test('two browser clients independently refresh only when each one is clean',async()=>{
  const a=fixture(),b=fixture();b.state.dirty=true;
  await Promise.all([a.client.poll(),b.client.poll()]);assert.equal(a.state.revision,2);assert.equal(b.state.revision,1);assert.equal(b.applied.length,0);
  b.state.dirty=false;await b.client.poll();assert.equal(b.state.revision,2);
});
test('an older state than the observed revision is rejected and retried later',async()=>{
  let incoming=1;const f=fixture({fetchState:async()=>({revision:incoming})});assert.equal(await f.client.poll(),false);assert.equal(f.errors.length,1);incoming=3;assert.equal(await f.client.poll(),true);assert.equal(f.state.revision,3);
});
test('failed requests keep data intact and a later successful poll recovers',async()=>{
  let fail=true;const f=fixture({fetchRevision:async()=>{if(fail)throw Error('offline');return {revision:2};}});assert.equal(await f.client.poll(),false);assert.equal(f.state.revision,1);fail=false;assert.equal(await f.client.poll(),true);
});
test('stopping invalidates a request already in flight',async()=>{
  const incoming=deferred(),started=deferred();const f=fixture({fetchState:()=>{started.resolve();return incoming.promise;}});const polling=f.client.poll();await started.promise;f.client.stop();incoming.resolve({revision:2});assert.equal(await polling,false);assert.equal(f.applied.length,0);
});
test('applyRemote may decline a final local generation conflict',async()=>{
  const f=fixture({applyRemote:()=>false});assert.equal(await f.client.poll(),false);assert.equal(f.state.revision,1);
});
test('overlapping polls share no duplicate state request',async()=>{
  const incoming=deferred(),started=deferred();let count=0;const f=fixture({fetchState:()=>{count++;started.resolve();return incoming.promise;}});const first=f.client.poll();await started.promise;assert.equal(await f.client.poll(),false);incoming.resolve({revision:2});assert.equal(await first,true);assert.equal(count,1);
});
test('login links accept only the exact official HTTPS account hosts',()=>{
  assert.equal(safeProtonLoginURL('https://account.proton.me/login?test=1'),'https://account.proton.me/login?test=1');
  assert.equal(safeProtonLoginURL('https://account.protonmail.com/login'),'https://account.protonmail.com/login');
  for(const bad of ['http://account.proton.me/','https://account.proton.me.evil.example/','https://evil.example/account.proton.me','javascript:alert(1)','https://user:pass@account.proton.me/'])assert.equal(safeProtonLoginURL(bad),null);
});
test('sync labels distinguish manual operation, initial choice and active automation',()=>{
  assert.equal(syncPresentation({configured:false}).label,'Conectar outro computador');
  assert.equal(syncPresentation({configured:true,automatic:false}).label,'Sincronização manual');
  assert.equal(syncPresentation({configured:true,automatic:true,auto:{state:'choice_required'}}).label,'Escolha a versão inicial');
  assert.equal(syncPresentation({configured:true,automatic:true,transport:'proton',auto:{state:'idle'}}).label,'Sincronização automática ativa');
  assert.equal(syncPresentation({configured:true,automatic:true,transport:'folder',auto:{state:'idle'}}).label,'Pasta local atualizada');
  assert.match(syncPresentation({configured:true,automatic:true,transport:'folder',auto:{state:'idle'}}).message,/nuvem depende/);
});
