import test from 'node:test';
import assert from 'node:assert/strict';
import {createSyncClient,bindSyncActivity} from '../web/sync-client.js';
import {safeProtonLoginURL,syncPresentation,syncComparisonHTML,syncReceiveRequest} from '../web/sync-ui.js';

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
  assert.equal(syncPresentation({configured:true,automatic:false}).label,'Modo manual');
  assert.equal(syncPresentation({configured:true,automatic:true,auto:{state:'choice_required'}}).label,'Escolha a versão inicial');
  assert.equal(syncPresentation({configured:true,automatic:true,transport:'proton',auto:{state:'idle'}}).label,'Última verificação do Proton concluída');
  assert.equal(syncPresentation({configured:true,automatic:true,transport:'folder',auto:{state:'idle'}}).label,'Pasta local atualizada');
  assert.match(syncPresentation({configured:true,automatic:true,transport:'folder',auto:{state:'idle'}}).message,/nuvem depende/);
});

test('explicit holds renew edit leases and prevent refresh after the idle delay',async()=>{
  const f=fixture();f.client.hold('comparison');f.advance(10000);
  assert.equal(await f.client.poll(),false);assert.equal(f.leases.at(-1).busy,true);
  f.client.release('comparison');assert.equal(await f.client.poll(),false);
  f.advance(1600);assert.equal(await f.client.poll(),true);
});

test('a hold started during state download invalidates that pending result',async()=>{
  const incoming=deferred(),started=deferred();const f=fixture({fetchState:()=>{started.resolve();return incoming.promise;}});
  const polling=f.client.poll();await started.promise;f.client.hold('preview');incoming.resolve({revision:2});
  assert.equal(await polling,false);assert.equal(f.applied.length,0);
});

test('composition is protected until it ends or the editor loses focus, including long pauses',async()=>{
  for(const finish of ['compositionend','focusout']){
    const f=fixture(),listeners=new Map(),field={isConnected:true,matches:()=>true};
    const root={addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:type=>listeners.delete(type)};
    const detach=bindSyncActivity(f.client,root);
    listeners.get('compositionstart')({target:field});f.advance(9000);
    assert.equal(await f.client.poll(),false,finish);
    listeners.get(finish)({target:field});f.advance(1600);
    assert.equal(await f.client.poll(),true,finish);detach();assert.equal(listeners.size,0);
  }
});

test('removing a composing element does not leave a permanent receive hold',async()=>{
  const f=fixture(),field={isConnected:true};f.client.hold(field);f.advance(9000);
  assert.equal(await f.client.poll(),false);field.isConnected=false;assert.equal(await f.client.poll(),true);
});

test('status does not leave a stale success label when the local server is unavailable',()=>{
  const status={configured:true,transport:'proton',automatic:true,auto:{state:'idle'}};
  const presentation=syncPresentation(status,{},'Connection failed');
  assert.equal(presentation.state,'unavailable');assert.match(presentation.label,/indisponível/);
  assert.doesNotMatch(presentation.label,/concluída|ativa/);
  assert.equal(syncPresentation(status,{dirty:true}).state,'saving');
  assert.equal(syncPresentation({...status,localChanges:true}).state,'pending');
  assert.equal(syncPresentation(status,{conflict:true}).state,'local-conflict');
});

test('manual divergence and incomplete files remain actionable even when automation is disabled',()=>{
  const status={configured:true,automatic:false,auto:{state:'disabled'}};
  assert.equal(syncPresentation({...status,conflict:true}).state,'conflict');
  assert.equal(syncPresentation({...status,incomplete:1}).state,'incomplete');
  assert.equal(syncPresentation({...status,conflict:true,pendingMerge:true}).state,'pending');
  assert.match(syncPresentation({...status,conflict:true,pendingMerge:true}).message,/Publique uma nova cópia/);
  const automaticChoice=syncPresentation({...status,automatic:true,conflict:true,pendingMerge:true});
  assert.match(automaticChoice.message,/será publicada automaticamente na próxima verificação/);
  assert.doesNotMatch(automaticChoice.message,/Publique/);
  assert.match(syncPresentation(status).message,/apenas confere a pasta local/);
});

test('comparison escapes remote metadata and text and calls out unsafe attachment replacement',()=>{
  const attack='<img src=x onerror=alert(1)>',preview={safeToReceive:false,snapshot:{deviceName:attack,created:'bad',pages:attack,blocks:2},local:{pages:1,blocks:1},changes:{addedPages:1,removedPages:2,changedPages:3,addedBlocks:4,removedBlocks:5,changedBlocks:6},attachments:{added:0,changed:1,keptLocal:2},pages:[{title:attack,kind:'removed',removedBlocks:5}],blockChanges:[{page:attack,kind:'changed',before:attack,after:'<script>bad()</script>'}],blocksTruncated:true};
  const html=syncComparisonHTML(preview);
  assert.doesNotMatch(html,/<img|<script|<[^>]+onerror=/);
  assert.match(html,/&lt;img/);assert.match(html,/não pode ser recebida/);assert.match(html,/Amostra limitada/);
  assert.match(html,/2<\/strong><span>páginas removidas/);assert.match(html,/data indisponível/);
});

test('receive always carries the reviewed snapshot token and refuses changed or incomplete previews',()=>{
  const preview={id:'copy-1',revision:4,safeToReceive:true,preview:{fingerprint:'local-hash',snapshotHash:'archive-hash',heads:['copy-1']}};
  assert.deepEqual(syncReceiveRequest('copy-1',preview,{},4),{id:'copy-1',revision:4,preview:preview.preview});
  for(const state of [{dirty:true},{saving:true},{conflict:true},{ready:false}])assert.throws(()=>syncReceiveRequest('copy-1',preview,state,4),/mudaram/);
  assert.throws(()=>syncReceiveRequest('copy-1',preview,{},5),/mudaram/);
  assert.throws(()=>syncReceiveRequest('copy-2',preview,{},4),/validada/);
  assert.throws(()=>syncReceiveRequest('copy-1',{...preview,preview:undefined},{},4),/validada/);
  assert.throws(()=>syncReceiveRequest('copy-1',{...preview,safeToReceive:false},{},4),/anexos/);
});
