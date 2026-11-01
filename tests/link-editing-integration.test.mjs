import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as C from '../web/core.js';
import {pairTypedLink,stepOverLinkClose,linkCompletionEnd} from '../web/link-editing.js';
import {pageSuggestions,blockSuggestions,incomingBlockCounts} from '../web/link-discovery.js';

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
          showModal(){this.open=true;},close(){this.open=false;},focus(){document.activeElement=this;},matches(){return false;},closest(){return null;}});
        return nodes.get(selector);
      }
      return null;
    },
    querySelectorAll(){return [];},
    createElement(){return {className:'',innerHTML:'',remove(){}};}
  };
  function getEditor(id){
    const entry=C.findBlock(data,id);if(!entry)return null;
    if(editors.has(id)){const editor=editors.get(id);editor.value=entry.block.text;return editor;}
    const el={value:entry.block.text,selectionStart:0,selectionEnd:0,dataset:{editor:id},
      parentElement:{append(){}},matches(selector){return selector==='.block-editor';},
      closest(selector){return selector==='[data-scope]'?{dataset:{scope:'main'}}:null;},
      focus(){document.activeElement=this;},
      setRangeText(text,start,end){this.value=this.value.slice(0,start)+text+this.value.slice(end);this.setSelectionRange(start,start);},
      setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;}
    };
    editors.set(id,el);return el;
  }
  const context={C,pairTypedLink,stepOverLinkClose,linkCompletionEnd,pageSuggestions,blockSuggestions,incomingBlockCounts,
    blockRefCounts:new Map(),document,CSS:{escape:value=>value},
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
    setText(text,caret=text.length){block.text=text;editor.value=text;editor.setSelectionRange(caret,caret);},
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

test('a new block outside a backlink preview continues editing at its original location',()=>{
  const f=fixture(),originalQuery=f.document.querySelector.bind(f.document);let path;
  const next=C.newBlock('Continuação');f.page.blocks.push(next);
  f.context.history={replaceState(a,b,value){path=value;}};
  f.document.querySelector=selector=>selector.includes('[data-scope="connections-')||selector.startsWith('[data-id=')?null:originalQuery(selector);
  f.context.edit(next.id,'connections-main-other-linked-before',0,false);
  assert.equal(f.context.editing.id,next.id);assert.equal(f.context.editing.scope,'main');assert.equal(f.context.current,f.page.id);assert.equal(f.context.zoom,next.id);
  assert.equal(path,`#p/${f.page.id}/b/${next.id}`);assert.equal(f.document.activeElement.dataset.editor,next.id);assert.equal(f.page.blocks[1].text,'Continuação');
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
  ['second Escape after dismissing suggestions',f=>{f.key('Escape');f.key('Escape');}],
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

test('accent-insensitive page discovery inserts the real title without creating its unaccented spelling',()=>{
  const f=fixture();C.ensurePage(f.context.data,'Ação');f.type('[[acao');
  const index=f.context.suggestions.findIndex(item=>item.value==='Ação');
  assert.ok(index>=0);assert.ok(f.context.suggestions.some(item=>item.kind==='create'&&item.value==='acao'));
  f.context.acceptSuggestion(index);
  assert.equal(f.editor.value,'[[Ação]]');assert.deepEqual(f.titles(),['Origem','Ação']);
});

test('page autocomplete remains available inside parentheses in valid titles',()=>{
  const f=fixture();C.ensurePage(f.context.data,'Projeto (2026)');f.type('[[Projeto (');
  assert.equal(f.context.completion.type,'page');
  const index=f.context.suggestions.findIndex(item=>item.value==='Projeto (2026)');
  assert.ok(index>=0);f.context.acceptSuggestion(index);
  assert.equal(f.editor.value,'[[Projeto (2026)]]');
  assert.equal(f.editor.selectionStart,f.editor.value.length);
  assert.deepEqual(f.titles(),['Origem','Projeto (2026)']);
});

test('accepting midway through a parenthesized page title consumes the old suffix and closer',()=>{
  const f=fixture();C.ensurePage(f.context.data,'Projeto (2026)');
  f.setText('[[Projeto (2026)]] depois',5);f.context.complete(f.editor);
  const index=f.context.suggestions.findIndex(item=>item.value==='Projeto (2026)');
  assert.ok(index>=0);f.context.acceptSuggestion(index);
  assert.equal(f.editor.value,'[[Projeto (2026)]] depois');
  assert.equal(f.editor.selectionStart,'[[Projeto (2026)]]'.length);
});

test('tag discovery inserts a bracketed multiword tag and creates no partial page while typing',()=>{
  const f=fixture();C.ensurePage(f.context.data,'Meu projeto');
  f.type('Texto #Meu');assert.deepEqual(f.titles(),['Origem','Meu projeto']);
  assert.equal(f.context.completion.type,'tag');
  const index=f.context.suggestions.findIndex(item=>item.value==='Meu projeto');
  f.context.acceptSuggestion(index);
  assert.equal(f.editor.value,'Texto #[[Meu projeto]]');
  assert.deepEqual(f.titles(),['Origem','Meu projeto']);
  assert.equal(f.page.blocks.length,1);
});

test('tag acceptance retains a simple accented tag and leaves later prose unchanged',()=>{
  const f=fixture();C.ensurePage(f.context.data,'Ação');
  f.setText('Antes #acao depois',11);f.context.complete(f.editor);
  const index=f.context.suggestions.findIndex(item=>item.value==='Ação');assert.ok(index>=0);
  f.context.acceptSuggestion(index);
  assert.equal(f.editor.value,'Antes #Ação depois');assert.deepEqual(f.titles(),['Origem','Ação']);
});

test('tag acceptance midway through an existing token replaces its remainder',()=>{
  const f=fixture();C.ensurePage(f.context.data,'Projeto');
  f.setText('Antes #Projetox depois',9);f.context.complete(f.editor);
  const index=f.context.suggestions.findIndex(item=>item.value==='Projeto');assert.ok(index>=0);
  f.context.acceptSuggestion(index);
  assert.equal(f.editor.value,'Antes #Projeto depois');
  assert.deepEqual(f.titles(),['Origem','Projeto']);
});

test('first Escape only dismisses discovery and keeps the insertion point and uncommitted title',()=>{
  const f=fixture();f.type('[[Página em construção');
  const caret=f.editor.selectionStart,generation=f.context.generation,text=f.editor.value;
  assert.equal(f.key('Escape').defaultPrevented,true);
  assert.equal(f.context.completion,null);assert.equal(f.context.suggestions.length,0);
  assert.equal(f.context.editing.id,f.block.id);assert.equal(f.document.activeElement,f.editor);
  assert.equal(f.editor.selectionStart,caret);assert.equal(f.editor.value,text);
  assert.equal(f.context.generation,generation);assert.deepEqual(f.titles(),['Origem']);
  f.type(' final');assert.equal(f.context.completion.type,'page');
});

test('block discovery can find page and ancestor context then insert the stable UID',()=>{
  const f=fixture(),target=C.newBlock('Detalhes do orçamento'),parent=C.newBlock('Planejamento anual');
  parent.children.push(target);C.ensurePage(f.context.data,'Projeto solar').blocks=[parent];
  f.type('((solar orçamento');
  assert.equal(f.context.completion.type,'block');
  const index=f.context.suggestions.findIndex(item=>item.value===target.id);assert.ok(index>=0);
  assert.match(f.context.suggestions[index].label,/Projeto solar.*Planejamento anual/);
  f.context.acceptSuggestion(index);
  assert.equal(f.editor.value,`((${target.id}))`);assert.equal(f.context.editing.id,f.block.id);
  f.context.render();assert.equal(f.context.blockRefCounts.get(target.id),1);
});

test('Insert reference opens discovery at the selection and preserves both surrounding fragments',()=>{
  const f=fixture(),target=C.newBlock('Uma referência disponível');f.page.blocks.push(target);
  f.setText('Antes texto depois',6);f.editor.setSelectionRange(6,11);
  f.context.beginReference(f.block.id);
  assert.equal(f.block.text,'Antes (()) depois');assert.equal(f.editor.value,'Antes (()) depois');
  assert.equal(f.editor.selectionStart,8);assert.equal(f.context.completion.type,'block');
  assert.ok(f.context.suggestions.every(item=>item.value!==f.block.id));
  const index=f.context.suggestions.findIndex(item=>item.value===target.id);assert.ok(index>=0);
  f.context.acceptSuggestion(index);
  assert.equal(f.block.text,`Antes ((${target.id})) depois`);
});
