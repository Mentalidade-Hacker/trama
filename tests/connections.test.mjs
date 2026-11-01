import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../web/core.js';
import {renderRich,escapeHTML} from '../web/renderer.js';
import {pageConnections,blockConnections,renderPageConnections,renderBlockConnections} from '../web/connections.js';
const block=(id,text,children=[])=>({id,text,children,collapsed:false});
function graph(blocks=[]) {return {version:1,pages:[{id:'source',title:'Origem',blocks},{id:'target-page',title:'Destino',blocks:[block('target','Original')]}]};}
const flatten=nodes=>nodes.flatMap(node=>[node,...flatten(node.children)]);
const nodes=model=>model.groups.flatMap(group=>flatten(group.nodes));
function rich(data){return (text,seen,owner)=>renderRich(text,{findBlock:id=>C.findBlock(data,id),math:escapeHTML,query:()=>'',embedBlock:()=>'',embedPage:()=>''},seen,owner);}

test('backlinks share ancestor breadcrumbs and children remain context rather than extra links',()=>{
  const data=graph([block('grand','Projeto',[block('parent','Reunião',[block('a','[[Destino]]',[block('child','Detalhe sem ligação')]),block('b','#Destino')])])]);
  const original=JSON.stringify(data),model=pageConnections(data,data.pages[1]).linked;
  assert.equal(model.total,2);assert.equal(model.groups.length,1);
  assert.deepEqual(model.groups[0].ancestors.map(e=>e.block.id),['grand','parent']);
  assert.deepEqual(nodes(model).map(n=>[n.entry.block.id,n.direct]),[['a',true],['child',false],['b',true]]);
  const html=renderPageConnections(data,data.pages[1],{rich:rich(data)});
  assert.equal((html.match(/class="connection-trail"/g)||[]).length,1);
  assert.match(html,/data-page="Origem"/);assert.match(html,/data-ref="parent"/);
  assert.match(html,/data-goto="child"/);assert.match(html,/data-connections/);
  assert.equal(JSON.stringify(data),original);
});

test('matching parent and child are shown once each and count as distinct referencing blocks',()=>{
  const data=graph([block('a','[[Destino]]',[block('b','[[Destino]]',[block('c','Contexto')])])]);
  const model=pageConnections(data,data.pages[1]).linked;
  assert.equal(model.total,2);assert.equal(model.groups[0].nodes.length,1);
  assert.deepEqual(nodes(model).map(n=>n.entry.block.id),['a','b','c']);
  assert.equal(nodes(model).filter(n=>n.direct).length,2);
});

test('separate parent paths and foreign pages retain their own context',()=>{
  const data=graph([block('a','Assunto A',[block('x','[[Destino]]')]),block('b','Assunto B',[block('y','[[Destino]]')])]);
  data.pages.push({id:'other',title:'Outra página',blocks:[block('z','[[Destino]]')]});
  const model=pageConnections(data,data.pages[1]).linked;
  assert.equal(model.total,3);assert.equal(model.groups.length,3);
  assert.deepEqual(model.groups.map(g=>[g.page.title,g.ancestors.map(e=>e.block.id)]),[['Origem',['a']],['Origem',['b']],['Outra página',[]]]);
});

test('literal code, URL fragments, formulas and alias labels do not create page backlinks',()=>{
  const data=graph([block('code','`[[Destino]]`'),block('fence','```\n[[Destino]]\n```'),block('url','https://example.test/[[Destino]]'),block('math','$$[[Destino]]$$'),block('label','[Destino]([[Outra]])'),block('alias','[Ir]([[Destino]])')]);
  const model=pageConnections(data,data.pages[1]);
  assert.deepEqual(nodes(model.linked).filter(n=>n.direct).map(n=>n.entry.block.id),['alias']);
  assert.equal(model.unlinked.total,0);
  assert.match(renderPageConnections(data,data.pages[1],{rich:rich(data)}),/data-page="Destino">Ir<\/a>/);
});

test('unlinked mentions preserve the link action and do not include linked/code mentions',()=>{
  const data=graph([block('parent','Contexto',[block('plain','Destino aparece aqui')]),block('linked','[[Destino]]'),block('literal','`Destino`')]);
  const model=pageConnections(data,data.pages[1]);assert.equal(model.unlinked.total,1);
  const html=renderPageConnections(data,data.pages[1]);
  assert.match(html,/data-link-mention="plain" data-title="Destino"/);
  assert.match(html,/data-connections-kind="unlinked"/);
  assert.ok(!html.includes('data-link-mention="literal"'));
});

test('incoming block references include aliases and embeds, protect literal refs and mark self references',()=>{
  const data=graph([block('ref','((target)) e ((target))'),block('alias','[Ir](((target)))'),block('embed','{{embed: ((target))}}'),block('code','`((target))`'),block('url','https://example.test/((target))'),block('foreign','((other))')]);
  data.pages[1].blocks[0].text='Autorreferência ((target))';
  const entry=C.findBlock(data,'target'),model=blockConnections(data,entry);
  assert.equal(model.total,4);assert.equal(nodes(model).filter(n=>n.self).length,1);
  assert.deepEqual(nodes(model).filter(n=>n.direct).map(n=>n.entry.block.id),['ref','alias','embed','target']);
  assert.match(renderBlockConnections(data,entry,{rich:rich(data)}),/Referência ao próprio bloco/);
});

test('display limits preserve every selected reference even when the first subtree is large',()=>{
  const children=Array.from({length:20},(_,i)=>block('child-'+i,'Contexto'));
  const data=graph([block('a','[[Destino]]',children),block('b','[[Destino]]'),block('c','[[Destino]]'),block('d','[[Destino]]')]);
  const model=pageConnections(data,data.pages[1],{limit:3,maxNodes:5}).linked;
  assert.equal(model.total,4);assert.equal(model.shown,3);assert.equal(model.hidden,1);assert.equal(model.nodeCount,5);
  assert.deepEqual(nodes(model).filter(n=>n.direct).map(n=>n.entry.block.id),['a','b','c']);
  assert.ok(model.truncated);
  assert.match(renderPageConnections(data,data.pages[1],{limit:3,maxNodes:5}),/Mostrando 3 de 4 blocos/);
});

test('a deeply nested match outside a parent preview remains independently reachable',()=>{
  const data=graph([block('a','[[Destino]]',[block('b','Contexto',[block('c','Contexto',[block('d','[[Destino]]')])])])]);
  const model=pageConnections(data,data.pages[1],{maxDepth:1}).linked;
  assert.deepEqual(nodes(model).filter(n=>n.direct).map(n=>n.entry.block.id),['a','d']);
  assert.equal(model.groups.length,2);assert.ok(model.truncated);
});

test('empty panels omit filters, fixed IDs and orphan link controls',()=>{
  const data=graph(),html=renderPageConnections(data,data.pages[1])+renderBlockConnections(data,C.findBlock(data,'target'));
  assert.ok(!html.includes('data-reference-filter'));assert.ok(!html.includes('data-link-mention'));
  assert.ok(!/\sid=/.test(html));assert.match(html,/Nenhuma menção sem link/);
});

test('fallback escapes user HTML, clips long text without splitting emoji, and does not expand query macros',()=>{
  const data=graph([block('raw','<img src=x onerror=alert(1)> [[Destino]]'),block('large','[[Destino]] '+ 'a'.repeat(67)+'🙂texto'),block('query','{{query: [[Destino]]}}')]);
  let calls=0;
  const html=renderPageConnections(data,data.pages[1],{maxText:80,rich:text=>{calls++;return escapeHTML(text);}});
  assert.ok(!html.includes('<img'));assert.match(html,/&lt;img/);assert.match(html,/Trecho do bloco/);
  assert.ok(!/[\ud800-\udbff](?![\udc00-\udfff])/.test(html));assert.equal(calls,1);
});

test('editable previews use unique caller scopes, preserve original text and never mutate children',()=>{
  const data=graph([block('a','[[Destino]]',[block('b','[[Destino]]')])]),before=JSON.stringify(data),calls=[];
  function renderBlock(value,scope){calls.push({value,scope});assert.deepEqual(value.children,[]);return `<li data-scope="${escapeHTML(scope)}">${escapeHTML(value.text)}</li>`;}
  renderPageConnections(data,data.pages[1],{scope:'main',renderBlock});
  renderPageConnections(data,data.pages[1],{scope:'right-card',renderBlock});
  assert.equal(calls.length,4);assert.equal(new Set(calls.map(c=>c.scope)).size,4);
  assert.deepEqual(calls.map(c=>c.scope),['main-linked-a-a','main-linked-a-b','right-card-linked-a-a','right-card-linked-a-b']);
  assert.equal(JSON.stringify(data),before);
});
