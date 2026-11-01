import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as C from '../web/core.js';
import {pairTypedLink,stepOverLinkClose,linkCompletionEnd} from '../web/link-editing.js';

// Exercise the application's actual handlers and graph mutations. The DOM and
// timers below only stand in for browser primitives; no editing logic is copied.
const app=fs.readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
function section(from,to){
  const start=app.indexOf(from),end=app.indexOf(to,start+from.length);
  assert.ok(start>=0&&end>start,`Application section exists: ${from}`);
  return app.slice(start,end);
}

function fixture(){
  const page=C.newPage('Origem'),data={version:1,pages:[page]},block=page.blocks[0];
  const listeners=new Map(),timers=new Map(),editors=new Map(),nodes=new Map(),saved=[];
  let nextTimer=0;
  const document={activeElement:null,
    addEventListener(type,callback){listeners.set(type,callback);},
    querySelector(selector){
      if(selector==='#dictionary-dialog[open]')return null;
      if(selector==='.block-editor:focus')return this.activeElement?.matches('.block-editor')?this.activeElement:null;
      if(selector==='.block-editor')return editors.get(context.editing?.id)||null;
      const id=selector.match(/\[data-editor="([^"]+)"\]/)?.[1];
      if(id)return getEditor(id);
      if(selector.startsWith('#')){
        if(!nodes.has(selector))nodes.set(selector,{open:false,innerHTML:'',textContent:'',
          showModal(){this.open=true;},focus(){document.activeElement=this;},matches(){return false;},closest(){return null;}});
        return nodes.get(selector);
      }
      return null;
    },
    querySelectorAll(){return [];},
    createElement(){return {className:'',innerHTML:'',remove(){}};}
  };
  function getEditor(id){
    if(editors.has(id))return editors.get(id);
    const entry=C.findBlock(data,id);if(!entry)return null;
    const el={value:entry.block.text,selectionStart:0,selectionEnd:0,dataset:{editor:id},
      parentElement:{append(){}},matches(selector){return selector==='.block-editor';},
      closest(selector){return selector==='[data-scope]'?{dataset:{scope:'main'}}:null;},
      focus(){document.activeElement=this;},
      setRangeText(text,start,end){this.value=this.value.slice(0,start)+text+this.value.slice(end);this.setSelectionRange(start,start);},
      setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;}
    };
    editors.set(id,el);return el;
  }
  const context={C,pairTypedLink,stepOverLinkClose,linkCompletionEnd,document,CSS:{escape:value=>value},
    data,editing:{id:block.id,scope:'main'},revision:0,dirty:false,saving:false,conflict:false,generation:0,
    current:page.id,view:'page',zoom:null,rightStack:[],selectedBlocks:new Set(),recent:[],location:{hash:'#pages'},
    suggestions:[],suggestionIndex:0,completion:null,commands:[],saveTimer:null,
    pageById:id=>data.pages.find(item=>item.id===id),$:selector=>document.querySelector(selector),
    esc:value=>String(value),liveSync:{touch(){},activity(){}},status(){},toast(){},renderNav(){},
    resizeEditors(){},checkpoint(){},persistUI(){},todayTitle:()=> '2026-11-01',
    renderPage:()=>'',renderJournals:()=>'',renderPageList(){},renderGraph(){},renderRight(){},
    bindComponents(){},componentContext:()=>({}),renderSelection(){},searchResults(){},
    setTimeout(callback,delay){const id=++nextTimer;timers.set(id,{callback,delay});return id;},
    clearTimeout(id){timers.delete(id);},
    async fetch(url,options){assert.equal(url,'/api/state');saved.push(JSON.parse(options.body));return {ok:true,status:200,json:async()=>({revision:saved.length})};}
  };
  vm.createContext(context);
  vm.runInContext(section('function materialize(',"window.addEventListener('beforeunload'")+
    section('function render()','function pushRight(')+
    section('function route()',"window.addEventListener('hashchange'")+
    section('function search()','function searchResults(')+
    section('function edit(','function historyStep('),context);
  const editor=getEditor(block.id);editor.focus();
  return {context,document,page,block,editor,saved,
    titles:()=>data.pages.map(item=>item.title),
    type(text){for(const char of text){const start=editor.selectionStart,end=editor.selectionEnd;editor.value=editor.value.slice(0,start)+char+editor.value.slice(end);editor.setSelectionRange(start+char.length,start+char.length);listeners.get('input')({target:editor,inputType:'insertText',data:char});}},
    key(key,extra={}){const event={target:editor,key,preventDefault(){this.defaultPrevented=true;},...extra};listeners.get('keydown')(event);return event;},
    blur(){document.activeElement=null;listeners.get('focusout')({target:editor});},
    async tick(delay){for(const [id,timer] of [...timers])if(timer.delay===delay&&timers.delete(id))await timer.callback();}
  };
}

test('typing an automatically closed link saves its text without creating one page per letter, then blur creates only its final title',async()=>{
  const f=fixture();
  for(const char of '[[Página completa'){
    f.type(char);await f.tick(450);
    assert.deepEqual(f.titles(),['Origem']);
    assert.equal(f.block.text,f.editor.value);
  }
  assert.equal(f.editor.value,'[[Página completa]]');
  assert.ok(f.saved.length>2,'Autosave actually ran between characters');
  assert.ok(f.saved.every(payload=>payload.data.pages.length===1));
  f.blur();await f.tick(160);
  assert.deepEqual(f.titles(),['Origem','Página completa']);
  await f.tick(450);
  assert.deepEqual(f.saved.at(-1).data.pages.map(page=>page.title),['Origem','Página completa']);
});

test('Enter accepts a page suggestion and materializes one final page without duplicate closing brackets',()=>{
  const f=fixture();f.type('[[Nova ideia');
  assert.deepEqual(f.titles(),['Origem']);
  assert.equal(f.key('Enter').defaultPrevented,true);
  assert.equal(f.editor.value,'[[Nova ideia]]');
  assert.deepEqual(f.titles(),['Origem','Nova ideia']);
  assert.equal(f.page.blocks.length,1,'Accepting the suggestion does not split the block');
});

test('switching to another block commits the previous final title before editing the new block',()=>{
  const f=fixture(),next=C.newBlock();f.page.blocks.push(next);f.type('[[Ideia final');
  f.context.edit(next.id,'main',0);
  assert.deepEqual(f.titles(),['Origem','Ideia final']);
  assert.equal(f.context.editing.id,next.id);
});

test('Enter after stepping over both closers creates a new block and commits the completed link',()=>{
  const f=fixture();f.type('[[Projeto');
  assert.equal(f.key(']').defaultPrevented,true);
  assert.equal(f.key(']').defaultPrevented,true);
  assert.deepEqual(f.titles(),['Origem']);
  assert.equal(f.key('Enter').defaultPrevented,true);
  assert.deepEqual(f.titles(),['Origem','Projeto']);
  assert.equal(f.page.blocks.length,2);
  assert.equal(f.page.blocks[0].text,'[[Projeto]]');
  assert.equal(f.page.blocks[1].text,'');
});

test('accepting a suggestion inside an existing link replaces the title remainder exactly once',()=>{
  const f=fixture();f.editor.value='[[agina]] depois';f.editor.setSelectionRange(2,2);
  f.type('P');
  const index=f.context.suggestions.findIndex(item=>item.value==='P');
  assert.ok(index>=0);f.context.acceptSuggestion(index);
  assert.equal(f.editor.value,'[[P]] depois');
  assert.deepEqual(f.titles(),['Origem','P']);
});

for(const [name,leave] of [
  ['Escape',f=>f.key('Escape')],
  ['navigation to another view',f=>f.context.route()],
  ['opening search',f=>f.key('k',{ctrlKey:true})]
])test(`${name} commits deferred links through render exactly once`,()=>{
  const f=fixture();f.type('[[Nome definitivo');
  const before=f.context.generation;
  f.context.render();
  assert.deepEqual(f.titles(),['Origem'],'Rendering while editing does not create a partial title');
  assert.equal(f.context.generation,before);
  leave(f);
  assert.equal(f.context.editing,null);
  assert.deepEqual(f.titles(),['Origem','Nome definitivo']);
  assert.equal(f.context.generation,before+1,'The commit records a single graph change');
  f.context.render();
  assert.equal(f.context.generation,before+1,'Rendering again neither changes graph nor recurses');
});
