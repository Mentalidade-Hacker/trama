import test from 'node:test';
import assert from 'node:assert/strict';
import {translationSnapshot,translationPracticeLesson,translationDraftSession} from '../web/translation-drafts.js';
import {createDraftStore} from '../web/learning-drafts.js';
import {validateLesson,savePractice,readPracticeAttempt} from '../web/learning-core.js';
import {setupTranslation} from '../web/translation-ui.js';
import * as C from '../web/core.js';

const context={target:'en',pageId:'page-1',pageTitle:'Minha página',blockId:'block-1',original:'Bom dia! 🙂',translation:'Good morning! 🙂'};
const clone=value=>JSON.parse(JSON.stringify(value));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
let fixtureSerial=0;
function fixture({deferred=false}={}) {
  const memory=new Map(),remote=new Map(),calls=[],fixtureId=++fixtureSerial;let serial=0,offline=false,resolveInitial;
  const initial=deferred?new Promise(resolve=>resolveInitial=resolve):null;
  const storage={getItem:key=>memory.get(key),setItem:(key,value)=>memory.set(key,value)};
  const create=()=>createDraftStore({storage,uid:()=>`draft-${fixtureId}-${++serial}`,delay:1_000_000,request:async(path,body)=>{
    calls.push({path,body});if(offline)throw Error('Servidor indisponível.');
    if(!body)return initial||{epoch:'epoch',records:[...remote.values()].map(clone)};
    const saved={id:body.data.id,revision:body.revision+1,updated:new Date().toISOString(),data:clone(body.data)};
    remote.set(saved.id,saved);return saved;
  }});
  return {storage,memory,remote,calls,create,offline:()=>offline=true,online:()=>offline=false,
    resolve:(records,epoch='epoch')=>resolveInitial({epoch,records})};
}

test('translation lessons preserve source/reference and distinguish changed text, language and origin',async()=>{
  const original=await translationPracticeLesson(context);
  assert.match(original.id,/^translation:en:page-1:block-1:[a-f0-9]{64}$/);
  assert.equal(original.kind,'writing');assert.equal(original.before,context.original);assert.equal(original.after,context.translation);
  assert.deepEqual(validateLesson(original),original);
  assert.equal((await translationPracticeLesson({...context})).id,original.id);
  for(const change of [{original:'Bom dia! Outra origem'},{translation:'Have a good morning!'},{target:'pt'},{pageId:'other-page'},{blockId:'other-block'}])assert.notEqual((await translationPracticeLesson({...context,...change})).id,original.id);
});

test('portable snapshots cut safely at 12000 UTF-16, while the identity includes the omitted suffix',async()=>{
  const long='x'.repeat(11998)+'😀'+'a'.repeat(500),a=await translationPracticeLesson({...context,original:long,translation:'🙂'.repeat(7000)});
  assert.ok(a.before.length<=12000);assert.ok(a.after.length<=12000);assert.equal(a.before,'x'.repeat(11998)+'…');
  assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/u.test(a.before+a.after));assert.match(a.explanation,/reticências/);
  const b=await translationPracticeLesson({...context,original:long+'changed',translation:'🙂'.repeat(7000)});
  assert.equal(a.before,b.before);assert.notEqual(a.id,b.id);
  assert.equal(translationSnapshot('😀'.repeat(6000)).length,12000);
  await assert.rejects(translationPracticeLesson({...context,blockId:'bad:id'}));
});

test('offline translation practice reloads with its snapshots and all 20000 UTF-16 units',async()=>{
  const f=fixture(),a=f.create();await a.ready;f.offline();
  const lesson=await translationPracticeLesson(context),activity=translationDraftSession(a,lesson),text='😀'.repeat(10000);
  activity.capture(text,{input:true});assert.equal(await a.flush(),false);
  const b=f.create();await b.ready;const restored=b.current(lesson.id);
  assert.equal(restored.data.text,text);assert.equal(restored.data.lesson.before,context.original);assert.equal(restored.data.lesson.after,context.translation);
  assert.equal(restored.data.tab,'writing');assert.ok(f.calls.every(call=>call.path==='/api/learning/drafts'));
  assert.throws(()=>activity.capture(text+'x',{input:true}),/20.000/);assert.equal(activity.text,text);
  f.online();await b.flush();
  const data={version:1,pages:[]},saved=savePractice(data,restored.data.lesson,restored.data.text);
  const attempt=saved.block.children.find(item=>item.text.startsWith('Minha escrita ·'));
  assert.equal(readPracticeAttempt(attempt).text,text);
});

test('late disk recovery fills only untouched fields and cannot overwrite a new attempt',async()=>{
  const lesson=await translationPracticeLesson(context),baseline=fixture(),server=baseline.create();await server.ready;
  server.set({key:lesson.id,lesson,tab:'writing',text:'Older saved text'});await server.flush();
  const records=[...baseline.remote.values()];
  for(const typed of [null,'My new attempt','']) {
    const f=fixture({deferred:true}),store=f.create(),activity=translationDraftSession(store,lesson);
    assert.equal(activity.text,'');
    if(typed!==null)activity.capture(typed,{input:true});
    f.resolve(records);await store.ready;
    assert.equal(activity.refresh(),typed===null?'Older saved text':typed);
    await store.flush();assert.equal(store.current(lesson.id).data.text,typed===null?'Older saved text':typed);
  }
});

test('changing the source creates another activity and does not reuse a previous attempt',async()=>{
  const f=fixture(),store=f.create();await store.ready;
  const a=await translationPracticeLesson(context),b=await translationPracticeLesson({...context,original:'Boa tarde!'});
  translationDraftSession(store,a).capture('Good morning.',{input:true});
  const next=translationDraftSession(store,b);assert.equal(next.text,'');next.capture('Good afternoon.',{input:true});
  assert.equal(store.current(a.id).data.text,'Good morning.');assert.equal(store.current(b.id).data.text,'Good afternoon.');await store.flush();
});

test('an untouched cached attempt respects a disk clear or restored epoch',async()=>{
  const lesson=await translationPracticeLesson(context);
  for(const changedEpoch of [false,true]) {
    const baseline=fixture(),seed=baseline.create();await seed.ready;
    seed.set({key:lesson.id,lesson,tab:'writing',text:'Old cached text'});await seed.flush();
    const f=fixture({deferred:true});for(const [key,value] of baseline.memory)f.memory.set(key,value);
    const store=f.create(),activity=translationDraftSession(store,lesson);assert.equal(activity.text,'Old cached text');
    const old=[...baseline.remote.values()][0],cleared={...old,revision:old.revision+1,data:{...old.data,text:''}};
    f.resolve(changedEpoch?[]:[cleared],changedEpoch?'restored':'epoch');await store.ready;
    assert.equal(activity.refresh(),'');assert.equal(activity.capture('')?.data.text||'','');
    assert.equal(store.status().pending,false);await store.flush();
    if(changedEpoch)assert.equal(store.archived[0].data.text,'Old cached text');
  }
});

test('an epoch change keeps early typing archived until an explicit new edit',async()=>{
  const lesson=await translationPracticeLesson(context),baseline=fixture(),seed=baseline.create();await seed.ready;
  seed.set({key:lesson.id,lesson,tab:'writing',text:'Before restore'});await seed.flush();
  const f=fixture({deferred:true});for(const [key,value] of baseline.memory)f.memory.set(key,value);
  const store=f.create(),activity=translationDraftSession(store,lesson);activity.capture('Early pending text',{input:true});
  const restored=[...baseline.remote.values()][0];f.resolve([restored],'restored');await store.ready;
  assert.equal(activity.refresh(),'Early pending text');assert.equal(activity.archived,true);assert.equal(activity.current(),null);
  activity.capture('Early pending text');assert.equal(store.current(lesson.id).data.text,'Before restore');assert.equal(store.status().pending,false);
  activity.capture('An explicit new edit',{input:true});assert.equal(activity.archived,false);
  assert.ok(store.list().some(row=>row.data.text==='Before restore'));assert.ok(store.list().some(row=>row.data.text==='An explicit new edit'));
  assert.ok(store.archived.some(row=>row.data.text==='Early pending text'));await store.flush();
});

// Small DOM fixture exercises actual panel event wiring without a browser dependency.
function uiFixture(store) {
  const previous=new Map(),nodes=new Map(),groups=new Map(),events=new Map(),windowEvents=new Map(),requests=[],toasts=[];
  const override=(name,value)=>{previous.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});};
  class Element {
    constructor(){this.value='';this.dataset={};this.hidden=false;this.open=false;this.listeners=new Map();this.classList={add(){},remove(){},toggle(){}};}
    set innerHTML(html){this.html=html;if(this===dialog){nodes.clear();groups.clear();}
      for(const match of html.matchAll(/\bid="([^"]+)"/g))nodes.set('#'+match[1],new Element());
      for(const [attribute,key] of [['data-practice','practice'],['data-save-vocab','saveVocab'],['data-reading','reading']]){
        const items=[...html.matchAll(new RegExp(`\\b${attribute}="([^"]+)"`,'g'))].map(match=>{const node=new Element();node.dataset[key]=match[1];return node;});
        if(items.length)groups.set(`[${attribute}]`,items);
      }
      if(html.includes('translation-reading')){nodes.set('.translation-reading',new Element());groups.set('.translation-reading article',[...html.matchAll(/<article class="translation-row"/g)].map(()=>new Element()));}
    }
    get innerHTML(){return this.html||'';}
    querySelector(selector){return nodes.get(selector)||null;}
    querySelectorAll(selector){return groups.get(selector)||[];}
    setAttribute(){} addEventListener(name,callback){this.listeners.set(name,callback);} focus(){} after(){} scrollIntoView(){}
    showModal(){this.open=true;}close(){this.open=false;this.listeners.get('close')?.();}
  }
  const dialog=new Element();
  override('document',{hidden:false,createElement:tag=>tag==='dialog'?dialog:new Element(),body:{append(){}},addEventListener:(name,callback)=>events.set(name,callback),dispatchEvent:event=>events.get(event.type)?.(event)});
  override('window',{addEventListener:(name,callback)=>windowEvents.set(name,callback)});
  override('CustomEvent',class{constructor(type,{detail}){this.type=type;this.detail=detail;}});
  override('fetch',async(path,options)=>{requests.push(path);return {ok:true,json:async()=>path==='/api/translate/status'?{available:true}:path==='/api/translate'?{texts:JSON.parse(options.body).texts.map(text=>({'Fonte':'Source','Olá':'Hello','Adeus':'Goodbye'}[text]||text))}:{matches:[]}};});
  const page=C.newPage('Fonte');page.blocks=[C.newBlock('Olá'),C.newBlock('Adeus')];
  const ui=setupTranslation({page,data:{version:1,pages:[page]},learningDrafts:store,finishEditing(){},toast:message=>toasts.push(message)});
  return {ui,page,dialog,nodes,groups,events,windowEvents,requests,toasts,cleanup(){for(const [name,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}}};
}

test('translation panel persists edits, captures backup flush and resumes the exact draft without retranslating',async()=>{
  const f=fixture(),store=f.create();await store.ready;const h=uiFixture(store);
  try {
    await h.ui.open('en');await h.groups.get('[data-practice]')[0].onclick();
    const field=h.nodes.get('#practice-attempt');field.value='My first version';field.oninput();
    assert.equal(store.list()[0].data.text,'My first version');assert.equal(h.nodes.get('#practice-attempt').value,'My first version');
    field.value='Latest text before backup';await h.ui.flushDrafts();assert.equal(store.list()[0].data.text,'Latest text before backup');
    const calls=h.requests.length;let detail;h.events.set('trama:learn',event=>detail=event.detail);
    h.nodes.get('#practice-resume').onclick();assert.equal(detail.draftId,store.list()[0].id);assert.equal(h.dialog.open,false);assert.equal(h.requests.length,calls);
    assert.equal(store.list()[0].data.lesson.before,'Olá');assert.equal(store.list()[0].data.lesson.after,'Hello');
  } finally {await store.flush();h.cleanup();}
});

test('switching blocks and reopening the translation panel keeps attempts attached to their source',async()=>{
  const f=fixture(),store=f.create();await store.ready;const h=uiFixture(store);
  try {
    await h.ui.open('en');await h.groups.get('[data-practice]')[0].onclick();
    h.nodes.get('#practice-attempt').value='First block';h.nodes.get('#practice-attempt').oninput();
    await h.groups.get('[data-practice]')[1].onclick();assert.equal(h.nodes.get('#practice-attempt').value,'');
    h.nodes.get('#practice-attempt').value='Second block';h.nodes.get('#practice-attempt').oninput();
    h.dialog.close();await h.ui.open('en');await h.groups.get('[data-practice]')[0].onclick();assert.equal(h.nodes.get('#practice-attempt').value,'First block');
    h.nodes.get('#practice-attempt').value='Captured on hide';h.windowEvents.get('pagehide')();assert.ok(store.list().some(row=>row.data.text==='Captured on hide'));
    assert.ok(store.list().some(row=>row.data.text==='Second block'));
  } finally {await store.flush();h.cleanup();}
});

test('a late draft read never rewrites an active translation field or moves text to another block',async()=>{
  const f=fixture({deferred:true}),store=f.create(),h=uiFixture(store);
  try {
    await h.ui.open('en');await h.groups.get('[data-practice]')[0].onclick();
    h.nodes.get('#practice-attempt').value='Typing while server waits';h.nodes.get('#practice-attempt').oninput();
    await h.groups.get('[data-practice]')[1].onclick();h.nodes.get('#practice-attempt').value='Other block';h.nodes.get('#practice-attempt').oninput();
    f.resolve([]);await store.ready;await tick();assert.equal(h.nodes.get('#practice-attempt').value,'Other block');
    assert.equal(store.list().length,2);assert.ok(store.list().some(row=>row.data.text==='Typing while server waits'));
  } finally {await store.flush();h.cleanup();}
});
