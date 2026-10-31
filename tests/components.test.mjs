import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {componentKind,tableRows,tableWidth,tableCell,addTableRow,addTableColumn,deleteTableColumn,sortTable,pasteTable,moveKanbanCard,calculate,sliderValues,countWords,renderComponent,renderMath,bindComponents} from '../web/components.js';
let sequence=0;const block=(text='')=>({id:'component-'+(++sequence),text,children:[],collapsed:false});
const row=(...texts)=>{const root=block(texts.shift());let last=root;for(const text of texts){const next=block(text);last.children.push(next);last=next;}return root;};
test('table follows real block chains and adds cells without discarding branches',()=>{
  const table=block('{{table}}');table.children=[row('Name','Count'),row('Tea','2')];
  const branch=block('Side note');table.children[1].children.push(branch);
  assert.equal(tableWidth(table),2);addTableColumn(table,block);assert.equal(tableWidth(table),3);
  assert.equal(table.children[1].children[1],branch);assert.equal(tableCell(table,1,2,block).text,'');
  const added=addTableRow(table,block);assert.equal(tableRows(table)[2].length,3);assert.equal(added,table.children[2]);
});
test('table sorting preserves header, subtrees, identities and sorts numeric values',()=>{
  const table=block();const header=row('Item','Value'),a=row('A','$30.00'),b=row('B','$4.50'),c=row('C','$100.00');table.children=[header,a,b,c];
  sortTable(table,1,1);assert.deepEqual(table.children,[header,b,a,c]);sortTable(table,1,-1);assert.deepEqual(table.children,[header,c,a,b]);
});
test('table paste grows grid and column deletion preserves unrelated branches',()=>{
  const table=block();pasteTable(table,0,0,'Name\tCount\nCoffee\t2',block);assert.equal(tableRows(table)[1][1].text,'2');
  const branch=block('note');table.children[1].children.push(branch);deleteTableColumn(table,0,block);
  assert.equal(table.children[1].text,'2');assert.ok(table.children[1].children.includes(branch));
  const before=JSON.stringify(table);assert.throws(()=>pasteTable(table,999,99,'a\tb\nc\td',block));assert.equal(JSON.stringify(table),before);
});
test('kanban move retains card identity and nested content',()=>{
  const board=block(),left=block('Todo'),right=block('Done'),card=block('Work');card.children=[block('Nested')];left.children=[card];board.children=[left,right];
  assert.equal(moveKanbanCard(board,card.id,right.id),true);assert.equal(left.children.length,0);assert.equal(right.children[0],card);assert.equal(card.children.length,1);
  assert.equal(moveKanbanCard(board,card.id,right.id),false);assert.throws(()=>moveKanbanCard(board,card.id,'missing'));
});
test('calculator respects arithmetic and rejects code, malformed input and nonfinite values',()=>{
  assert.equal(calculate('2 + 3 * (4 - 1)'),11);assert.equal(calculate('2^3^2'),512);assert.equal(calculate('-2^2'),-4);assert.equal(calculate('2^-2'),.25);assert.equal(calculate('1e3 / 4'),250);
  for(const value of ['alert(1)','globalThis.x=1','2 +','1 / 0','(1+2','1 2',''])assert.throws(()=>calculate(value));
});
test('component syntax, sliders and counts validate input',()=>{
  assert.deepEqual(componentKind('{{[[table]]}}'),{kind:'table',argument:''});assert.equal(componentKind('prefix {{table}}'),null);
  assert.deepEqual(sliderValues('0 10 99 0.5'),{min:0,max:10,value:10,step:.5});assert.throws(()=>sliderValues('5 1 3'));
  const root=block();root.children=[block('Olá, mundo!'),block('English words')];root.children[0].children.push(block('one-more'));assert.equal(countWords(root),5);
});
test('rendering escapes hostile input and uses local math in safe mode',()=>{
  const table=block('{{table}}');table.children=[row('<script>alert(1)</script>')];const html=renderComponent(table);assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));
  assert.ok(renderComponent(block('{{calc: alert(1)}}')).includes('component-error'));assert.equal(renderComponent(block('normal text')),null);
  let options;globalThis.katex={renderToString:(tex,opts)=>{options=opts;return '<math>'+tex+'</math>';}};assert.equal(renderMath('x',true),'<math>x</math>');assert.equal(options.trust,false);assert.equal(options.displayMode,true);delete globalThis.katex;
});
test('bundled KaTeX renders actual fractions and rejects trusted HTML commands',()=>{
  const require=createRequire(import.meta.url);globalThis.katex=require('../web/vendor/katex/katex.min.js');
  const html=renderMath('\\frac{a^2+b^2}{c}',true);assert.ok(html.includes('katex-display'));assert.ok(html.includes('<math'));assert.ok(html.includes('mfrac'));
  const hostile=renderMath('\\href{javascript:alert(1)}{x}');assert.ok(!hostile.includes('href="javascript:'));delete globalThis.katex;
});
test('delegated controls leave foreign feature buttons and checkboxes for the app',()=>{
  const listeners=new Map(),container={addEventListener:(type,fn)=>{if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);}};
  bindComponents(container,{});
  for(const attributes of [['data-query-builder'],['data-template-apply'],['data-component-plugin']]){
    let stopped=false;const target={closest:selector=>selector==='button'?target:{dataset:{componentOwner:'owner'}},matches:selectors=>selectors.split(',').some(s=>attributes.includes(s.slice(1,-1)))};
    for(const listener of listeners.get('click'))listener({target,stopPropagation:()=>stopped=true,preventDefault:()=>{throw Error('Foreign control captured');}});
    assert.equal(stopped,false);
  }
});
test('table preview is refreshed as safe rich content after editing an initially empty cell',()=>{
  const listeners=new Map(),container={addEventListener:(type,fn)=>{if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);}};
  const table=block('{{table}}'),cell=block('');table.children=[cell];let renderedOwner=null;
  bindComponents(container,{findBlock:()=>({block:table,page:{id:'p'}}),rich:(text,seen,owner)=>{renderedOwner=owner;return '<a data-page="Projeto">[[Projeto]]</a>';}});
  const preview={classList:{contains:()=>true}},target={value:'[[Projeto]]',dataset:{componentCell:cell.id},nextElementSibling:null,ownerDocument:{createElement:()=>preview},insertAdjacentElement:(position,el)=>{target.nextElementSibling=el;},closest:()=>({dataset:{componentOwner:table.id}}),matches:selector=>selector==='[data-component-cell]'};
  for(const listener of listeners.get('change'))listener({target});
  assert.equal(renderedOwner,cell.id);assert.ok(preview.innerHTML.includes('data-page="Projeto"'));assert.equal(preview.hidden,false);
});
