import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {checkWritingRules,mergeWritingMatches} from '../web/writing-rules.js';
import {maskMarkup,applySuggestion,isProtectedRange} from '../web/proofread.js';

// Execute the actual UI module with a small DOM/timer boundary. Engines are
// controlled separately so local suggestions cannot accidentally depend on LT.
const source=fs.readFileSync(new URL('../web/live-writing.js',import.meta.url),'utf8')
  .replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
function fixture({text='Ola tudo bem ?',language='pt-BR',spelling=()=>({matches:[]}),grammarAvailable=false}={}){
  const listeners=new Map(),timers=new Map(),storage=new Map(),nodes=[],requests=[];let checkpoints=0;
  let nextTimer=0;
  class Element {
    constructor(){this.style={};this.dataset={};this.classList={add(){}};this.isConnected=true;this._html='';this.queries=new Map();this.events=new Map();nodes.push(this);}
    set innerHTML(value){this._html=value;this.queries.clear();}get innerHTML(){return this._html;}
    before(){}after(){}append(){}prepend(){}setAttribute(){}focus(){document.activeElement=this;}
    matches(selector){return this===el&&selector.split(',').some(part=>part==='.block-editor');}
    closest(){return null;}
    contains(node){return node===this||[...this.queries.values()].includes(node);}
    setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;}
    addEventListener(type,callback){this.events.set(type,callback);}
    dispatchEvent(event){event.target=this;document.emit(event.type,event);return true;}
    querySelectorAll(selector){
      const attribute=/^\[([\w-]+)\]$/.exec(selector)?.[1];if(!attribute)return [];
      const expression=new RegExp(attribute+'(?:="([^"\\n]*)")?(?=[ >])','g'),result=[];
      for(const match of this._html.matchAll(expression)){
        const key=attribute+':'+(match[1]||'');let node=this.queries.get(key);
        if(!node){node=new Element();node.dataset[attribute.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())]=match[1]||'';this.queries.set(key,node);}
        result.push(node);
      }return result;
    }
    querySelector(selector){
      if(selector.startsWith('['))return this.querySelectorAll(selector)[0]||null;
      if(!this.queries.has(selector))this.queries.set(selector,new Element());return this.queries.get(selector);
    }
  }
  const document={activeElement:null,createElement:()=>new Element(),
    addEventListener(type,callback){listeners.set(type,callback);},
    emit(type,event){listeners.get(type)?.(event);},dispatchEvent(){},querySelector(){return null;}};
  const el=new Element();Object.assign(el,{value:text,selectionStart:text.length,selectionEnd:text.length,
    tagName:'TEXTAREA',clientWidth:600,clientHeight:100,scrollLeft:0,scrollTop:0});el.dataset.writingLanguage=language;
  const context={document,checkWritingRules,mergeWritingMatches,maskMarkup,applySuggestion,isProtectedRange,
    correctionForStudy(){return {};},ResizeObserver:class{observe(){}disconnect(){}},getComputedStyle:()=>({}),
    Event:class{constructor(type){this.type=type;}},CustomEvent:class{},
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
    setTimeout(callback,delay){const id=++nextTimer;timers.set(id,{callback,delay});return id;},clearTimeout:id=>timers.delete(id),
    spellingRequest:async payload=>{requests.push(payload);return spelling(payload);},
    fetch:async url=>{requests.push(url);assert.equal(url,'/api/proofread/status');return {ok:true,json:async()=>({available:grammarAvailable})};}
  };
  vm.createContext(context);vm.runInContext(source,context);
  context.setupLiveWriting({language:()=>language,checkpoint(){checkpoints++;},toast(message){throw Error(message);},modal(){}});
  el.focus();document.emit('focusin',{target:el});document.emit('input',{target:el});
  return {el,document,requests,storage,
    panel:()=>nodes.find(node=>node.className==='live-writing-feedback'),
    mirror:()=>nodes.find(node=>node.className==='live-writing-mirror'),
    nodes,checkpoints:()=>checkpoints,
    expand(){const panel=nodes.find(node=>node.className==='live-writing-feedback');panel.querySelector('[data-live-toggle]').onclick();},
    input(value){el.value=value;el.setSelectionRange(value.length,value.length);document.emit('input',{target:el});},
    async tick(delay){for(const [id,timer] of [...timers])if(timer.delay===delay&&timers.delete(id))await timer.callback();}
  };
}

test('local live suggestions appear before either engine responds and survive unavailable LanguageTool',async()=>{
  const f=fixture();await f.tick(100);
  assert.equal(f.requests.length,0,'Neither dictionary nor grammar is required for local rules');
  assert.equal(f.panel().querySelectorAll('[data-live-issue]').length,0,'Individual issues stay collapsed');
  assert.match(f.panel().innerHTML,/2 sugestões/);assert.match(f.panel().innerHTML,/aria-expanded="false"/);
  assert.ok(f.nodes.some(node=>(node.innerHTML.match(/<mark /g)||[]).length===2),'Both errors remain underlined immediately');
  assert.equal(f.el.value,'Ola tudo bem ?','Checks never rewrite the editor automatically');
  await f.tick(800);
  assert.match(f.panel().innerHTML,/2 sugestões/);f.expand();
  assert.match(f.panel().innerHTML,/Regras básicas locais/);
  assert.match(f.panel().innerHTML,/gramática ampliada: configurar/);
  assert.equal(f.panel().querySelectorAll('[data-live-issue]').length,2);
});

test('a slower dictionary response cannot replace the context-specific greeting suggestion',async()=>{
  const f=fixture({spelling:()=>({matches:[{offset:0,length:3,message:'Hunspell',replacements:[{value:'Onda'}],rule:{issueType:'misspelling'}}]})});
  await f.tick(100);f.expand();await f.tick(80);
  assert.equal(f.panel().querySelectorAll('[data-live-issue]').length,2);
  await f.panel().querySelectorAll('[data-live-issue]')[0].onclick();
  assert.match(f.panel().innerHTML,/Se a intenção é cumprimentar/);
  assert.match(f.panel().innerHTML,/Olá/);assert.doesNotMatch(f.panel().innerHTML,/Onda/);
  assert.equal(f.el.value,'Ola tudo bem ?');
});

test('accepting the greeting word dismisses its local rule and sends the same accepted word to Hunspell',async()=>{
  const f=fixture();await f.tick(100);f.expand();
  await f.panel().querySelectorAll('[data-live-issue]')[0].onclick();
  f.panel().querySelector('[data-live-accept]').onclick();await f.tick(0);
  assert.match(f.panel().innerHTML,/1 sugestão/,'The separate spacing suggestion remains in the compact count');
  assert.equal(f.panel().querySelectorAll('[data-live-issue]').length,0);
  assert.deepEqual(JSON.parse(f.storage.get('trama-spell-ignored')),{'pt-BR':['ola']});
  assert.equal(f.requests.find(item=>item.action==='check').ignored[0],'ola');
  assert.equal(f.el.value,'Ola tudo bem ?');
});

test('a clean block stays quiet but dictionary errors and the length limit remain visible',async()=>{
  const clean=fixture({text:'Texto correto.'});await clean.tick(100);await clean.tick(80);await clean.tick(800);
  assert.equal(clean.panel().hidden,true);assert.equal(clean.panel().innerHTML,'');
  const broken=fixture({text:'Texto.',spelling:()=>{throw Error('Dicionário indisponível');}});await broken.tick(80);
  assert.equal(broken.panel().hidden,false);assert.match(broken.panel().innerHTML,/role="alert">Dicionário indisponível/);
  assert.ok(broken.panel().querySelector('[data-live-settings]'));
  const long=fixture({text:'a'.repeat(20001)});assert.equal(long.panel().hidden,false);assert.match(long.panel().innerHTML,/20 mil caracteres/);
});

test('applying an expanded suggestion preserves editing focus, cursor and undo checkpoint',async()=>{
  const f=fixture();await f.tick(100);f.expand();await f.panel().querySelectorAll('[data-live-issue]')[0].onclick();
  f.panel().querySelectorAll('[data-live-fix]')[0].onclick();
  assert.equal(f.el.value,'Olá tudo bem ?');assert.equal(f.document.activeElement,f.el);
  assert.equal(f.el.selectionStart,3);assert.equal(f.el.selectionEnd,3);assert.equal(f.checkpoints(),1);
  await f.tick(100);assert.match(f.panel().innerHTML,/1 sugestão/);assert.equal(f.panel().querySelectorAll('[data-live-issue]').length,0);
});

test('keyboard focus survives expanding, asynchronous feedback and collapsing the compact panel',async()=>{
  const f=fixture();await f.tick(100);
  f.panel().querySelector('[data-live-toggle]').focus();f.expand();
  assert.equal(f.document.activeElement,f.panel().querySelector('[data-live-toggle]'));
  assert.match(f.panel().innerHTML,/aria-expanded="true"/);
  await f.tick(80);assert.equal(f.document.activeElement,f.panel().querySelector('[data-live-toggle]'));
  f.expand();assert.match(f.panel().innerHTML,/aria-expanded="false"/);
  assert.equal(f.document.activeElement,f.panel().querySelector('[data-live-toggle]'));
  assert.equal(f.el.value,'Ola tudo bem ?');
});

test('composition and a changed text invalidate pending local checks',async()=>{
  const f=fixture();f.document.emit('compositionstart',{target:f.el});await f.tick(100);
  assert.equal(f.panel().querySelectorAll('[data-live-issue]').length,0);
  f.input('Olá tudo bem?');f.document.emit('compositionend',{target:f.el});await f.tick(100);
  assert.equal(f.panel().querySelectorAll('[data-live-issue]').length,0);
  f.input('Ola tudo bem ?');f.input('Texto correto.');await f.tick(100);
  assert.equal(f.panel().querySelectorAll('[data-live-issue]').length,0);
  assert.equal(f.el.value,'Texto correto.');
});
