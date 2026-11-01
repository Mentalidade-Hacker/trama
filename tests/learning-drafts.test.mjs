import test from 'node:test';
import assert from 'node:assert/strict';
import {createDraftStore,browserDraftStore,DRAFT_CACHE,validateDraft} from '../web/learning-drafts.js';
import {setupLearning} from '../web/learning-ui.js';

const lesson={id:'lesson',kind:'word',language:'en',word:'precise',prompt:'Write a sentence.'};
const input=text=>({key:'lesson',tab:'words',lesson,text});
const clone=value=>JSON.parse(JSON.stringify(value));
function fixture() {
  const memory=new Map(),remote=new Map();let epoch='epoch-a',offline=false,serial=0;
  const storage={getItem:key=>memory.get(key),setItem:(key,value)=>memory.set(key,value)};
  const request=async(path,body)=>{
    if(offline)throw Error('Servidor indisponível.');
    if(!body)return {epoch,records:[...remote.values()].map(clone)};
    if(body.epoch!==epoch)throw Object.assign(Error('Restaurado'),{code:'draft_epoch'});
    const old=remote.get(body.data.id);
    if(old&&JSON.stringify(old.data)===JSON.stringify(body.data))return clone(old);
    if((old?.revision||0)!==body.revision)throw Object.assign(Error('Conflito'),{code:'draft_conflict'});
    const row={id:body.data.id,revision:body.revision+1,updated:new Date().toISOString(),data:clone(body.data)};
    remote.set(row.id,row);return clone(row);
  };
  const create=(options={})=>createDraftStore({request,storage,uid:()=>`id-${++serial}`,delay:1_000_000,...options});
  return {storage,remote,memory,request,create,setOffline:value=>offline=value,setEpoch:value=>epoch=value};
}

test('write-through cache survives reload before the server autosave',async()=>{
  const f=fixture(),first=f.create();await first.ready;first.set(input('Text before closing 🙂 [[literal]]'));
  assert.equal(JSON.parse(f.storage.getItem(DRAFT_CACHE)).records[0].data.text,'Text before closing 🙂 [[literal]]');
  const reopened=f.create();await reopened.ready;assert.equal(reopened.current('lesson').data.text,'Text before closing 🙂 [[literal]]');
  assert.equal(await reopened.flush(),true);await first.flush();assert.equal(f.remote.size,1);
});

test('offline draft is visibly pending then retried without duplicate records',async()=>{
  const f=fixture(),store=f.create();await store.ready;f.setOffline(true);store.set(input('Offline writing'));
  assert.equal(await store.flush(),false);assert.equal(store.status().pending,true);assert.match(store.status().message,/navegador/);
  f.setOffline(false);assert.equal(await store.flush(),true);assert.equal(store.status().pending,false);assert.equal(f.remote.size,1);
});

test('two windows editing the same saved draft preserve both versions',async()=>{
  const f=fixture(),a=f.create();await a.ready;a.set(input('Original'));await a.flush();
  const b=f.create();await b.ready;a.set(input('Window A'));b.set(input('Window B'));await a.flush();await b.flush();
  assert.deepEqual([...f.remote.values()].map(row=>row.data.text).sort(),['Window A','Window B']);
  assert.equal(b.list().length,2);
});

test('typing during a disk request retains the newer dirty text',async()=>{
  const f=fixture();let resolve,started;const began=new Promise(r=>started=r);
  const store=f.create({request:async(path,body)=>{if(body&&body.data.text==='First'){started();await new Promise(r=>resolve=r);}return f.request(path,body);}});
  await store.ready;store.set(input('First'));const saving=store.flush();await began;store.set(input('Second'));resolve();await saving;
  assert.equal(store.current('lesson').data.text,'Second');assert.equal(store.status().pending,true);await store.flush();
  assert.equal([...f.remote.values()][0].data.text,'Second');
});

test('restored epoch archives browser text and only recovers it explicitly',async()=>{
  const f=fixture(),a=f.create();await a.ready;a.set(input('Old browser draft'));await a.flush();
  f.setEpoch('epoch-b');f.remote.clear();const b=f.create();await b.ready;
  assert.equal(b.list().length,0);assert.equal(b.archived[0].data.text,'Old browser draft');
  const recovered=b.recoverArchived(0);assert.equal(recovered.revision,0);await b.flush();assert.equal(f.remote.size,1);
});

test('clearing text persists and does not resurrect the old draft',async()=>{
  const f=fixture(),a=f.create();await a.ready;a.set(input('Old'));await a.flush();a.set(input(''));await a.flush();
  const b=f.create();await b.ready;assert.equal(b.current('lesson').data.text,'');
});

test('storage quota failure is reported and the server can still save',async()=>{
  const f=fixture(),a=f.create({storage:{getItem:()=>null,setItem:()=>{throw Error('Quota');}}});await a.ready;a.set(input('Text'));
  assert.equal(a.status().cacheOK,false);await a.flush();assert.equal(a.status().pending,false);assert.equal(f.remote.size,1);
});

test('invalid lesson text and malformed cache cannot mutate saved drafts',async()=>{
  const f=fixture();f.storage.setItem(DRAFT_CACHE,'broken JSON');const a=f.create();await a.ready;
  assert.throws(()=>a.set(input('x'.repeat(12001))));assert.equal(a.list().length,0);
  assert.throws(()=>validateDraft({}));await a.flush();
});

class BrowserStorage {
  getItem(key){return Object.hasOwn(this,key)?this[key]:null;}
  setItem(key,value){this[key]=String(value);}
  removeItem(key){delete this[key];}
}
function browsers(f) {
  const localStorage=new BrowserStorage();let serial=0;
  const environment=(sessionStorage=new BrowserStorage())=>{
    const listeners=new Map();
    return {localStorage,sessionStorage,crypto:{randomUUID:()=>`browser-${++serial}`},
      addEventListener:(name,callback)=>listeners.set(name,callback),emit:name=>listeners.get(name)?.(),
      fetch:async(path,options)=>({ok:true,json:async()=>f.request(path,options?.body?JSON.parse(options.body):undefined)})};
  };
  return {environment,localStorage};
}

test('duplicated tabs have independent pending caches and reload prefers its own writer',async()=>{
  const f=fixture(),browser=browsers(f),envA=browser.environment(),a=browserDraftStore(()=>{},envA);await a.ready;
  const copiedSession=new BrowserStorage();copiedSession.setItem('trama-learning-writer',envA.sessionStorage.getItem('trama-learning-writer'));
  const envB=browser.environment(copiedSession),b=browserDraftStore(()=>{},envB);await b.ready;
  assert.notEqual(envA.sessionStorage.getItem('trama-learning-writer'),envB.sessionStorage.getItem('trama-learning-writer'));
  f.setOffline(true);a.set(input('Window A offline'));b.set(input('Window B offline'));
  await a.flush();await b.flush();
  const reopened=browserDraftStore(()=>{},browser.environment(envA.sessionStorage));await reopened.ready;
  assert.equal(reopened.current('lesson').data.text,'Window A offline');
  assert.ok(reopened.archived.some(row=>row.data.text==='Window B offline'));
  assert.ok(Object.values(browser.localStorage).some(raw=>JSON.parse(raw).records.some(row=>row.data.text==='Window B offline')));
});

test('closing only removes this document clean cache and leaves active or pending writers intact',async()=>{
  const f=fixture(),browser=browsers(f),envA=browser.environment(),a=browserDraftStore(()=>{},envA);await a.ready;
  a.set(input('Saved A'));await a.flush();
  const envB=browser.environment(),b=browserDraftStore(()=>{},envB);await b.ready;
  const keyA=DRAFT_CACHE+':'+envA.sessionStorage.getItem('trama-learning-writer'),keyB=DRAFT_CACHE+':'+envB.sessionStorage.getItem('trama-learning-writer');
  envA.emit('pagehide');assert.equal(browser.localStorage.getItem(keyA),null);assert.ok(browser.localStorage.getItem(keyB));
  f.setOffline(true);b.set(input('Pending B'));await b.flush();envB.emit('pagehide');assert.ok(browser.localStorage.getItem(keyB));
});

test('cache copy quota failure keeps recovered pending text in memory and never claims browser persistence',async()=>{
  const f=fixture(),browser=browsers(f),env=browser.environment(),first=browserDraftStore(()=>{},env);await first.ready;
  f.setOffline(true);first.set(input('Recover this text'));await first.flush();
  browser.localStorage.setItem=()=>{throw Error('Quota');};
  const reopened=browserDraftStore(()=>{},browser.environment(env.sessionStorage));await reopened.ready;
  assert.equal(reopened.current('lesson').data.text,'Recover this text');
  assert.equal(reopened.status().cacheOK,false);assert.doesNotMatch(reopened.status().message,/preservado no navegador|salvo neste computador/);
});

test('typing before the first epoch arrives preserves the text and never submits a null epoch',async()=>{
  const f=fixture();let finish;const response=new Promise(resolve=>finish=resolve),sent=[];
  const store=f.create({request:async(path,body)=>{if(!body)return response;sent.push(body);return f.request(path,body);}});
  store.set(input('Early text'));const saving=store.flush();assert.equal(JSON.parse(f.storage.getItem(DRAFT_CACHE)).epoch,null);assert.equal(sent.length,0);
  finish({epoch:'epoch-a',records:[]});await saving;
  assert.equal(store.current('lesson').data.text,'Early text');assert.equal(sent[0].epoch,'epoch-a');assert.equal(store.status().pending,false);
});

test('a malformed archived item does not hide other recoverable writing',async()=>{
  const f=fixture(),a=f.create();await a.ready;a.set(input('Keep archive'));await a.flush();
  const cached=JSON.parse(f.storage.getItem(DRAFT_CACHE));cached.archived=[{},cached.records[0]];cached.records=[];
  f.storage.setItem(DRAFT_CACHE,JSON.stringify(cached));const reopened=f.create();await reopened.ready;
  assert.equal(reopened.archived[0].data.text,'Keep archive');await reopened.flush();
});

test('an older learning open request cannot start a lookup after the initial drafts load',async()=>{
  const previous=new Map(),override=(name,value)=>{previous.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});};
  const stub={value:'',disabled:false,textContent:'',remove(){},focus(){}};
  const dialog={open:false,innerHTML:'',setAttribute(){},addEventListener(){},querySelector:selector=>selector==='[data-learning-writing]'?null:stub,querySelectorAll:()=>[],showModal(){this.open=true;},close(){this.open=false;}};
  let resolveDrafts;const initial=new Promise(resolve=>resolveDrafts=resolve),lookups=[];
  override('localStorage',new BrowserStorage());override('sessionStorage',new BrowserStorage());override('addEventListener',()=>{});
  override('document',{createElement:()=>dialog,body:{append(){}},addEventListener(){}});override('window',{addEventListener(){}});
  override('fetch',async(path,options)=>({ok:true,json:async()=>{if(path==='/api/learning/drafts')return initial;const body=JSON.parse(options.body);lookups.push(body.word);return {found:false,entries:[]};}}));
  try {
    const ui=setupLearning({data:{version:1,pages:[]},finishEditing(){},language:()=> 'en-US',toast(){},flush:async()=>true});
    const older=ui.open({word:'obsolete-request',language:'en'}),newer=ui.open({word:'latest-request',language:'en'});
    resolveDrafts({epoch:'epoch-a',records:[]});await Promise.all([older,newer]);await new Promise(resolve=>setImmediate(resolve));
    assert.deepEqual(lookups,['latest-request']);assert.match(dialog.innerHTML,/latest-request/);
  } finally {for(const [name,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}}
});
