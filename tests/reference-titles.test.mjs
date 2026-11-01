import test from 'node:test';
import assert from 'node:assert/strict';
import {extractRefs,rewriteBlockReferences,extractLinks,newPage,newBlock,instantiateTemplate,mergeGraph} from '../web/core.js';
test('block-looking text inside a page title is part of that page, not a block connection',()=>{
  const text='[[Título ((target))]] #[[Outro ((hidden))]] ((real))';
  assert.deepEqual(extractRefs(text),['real']);assert.deepEqual(extractLinks(text),['Título ((target))','Outro ((hidden))']);
  assert.equal(rewriteBlockReferences(text,id=>`((${id}-new))`),'[[Título ((target))]] #[[Outro ((hidden))]] ((real-new))');
});
test('real alias destinations and embeds survive alongside protected page titles and examples',()=>{
  const text='[rótulo](((real))) {{embed: ((embed))}} `((code))` https://example.test/((url)) [[Página ((title))]]';
  assert.deepEqual(extractRefs(text),['real','embed']);assert.equal(rewriteBlockReferences(text,id=>`((${id}-new))`),'[rótulo](((real-new))) {{embed: ((embed-new))}} `((code))` https://example.test/((url)) [[Página ((title))]]');
});
test('single opening brackets in valid page names stay literal for reference parsing',()=>{
  const text='[[A [ ((target))]] ((real))';
  assert.deepEqual(extractLinks(text),['A [ ((target))']);assert.deepEqual(extractRefs(text),['real']);
  assert.equal(rewriteBlockReferences(text,id=>`((${id}-new))`),'[[A [ ((target))]] ((real-new))');
});
test('template ID remapping preserves literal page names and rewrites only real references',()=>{
  const templates=newPage('Modelos'),destination=newPage('Destino'),shared=newBlock('Original'),use=newBlock();shared.id='shared';use.text='[[Literal ((shared))]] ((shared))';
  templates.blocks[0].text='Modelo #roam/templates';templates.blocks[0].children=[shared,use];
  const data={version:1,pages:[templates,destination]},copies=instantiateTemplate(data,templates.blocks[0].id,destination.blocks[0].id);
  assert.equal(copies[1].text,`[[Literal ((shared))]] ((${copies[0].id}))`);assert.equal(use.text,'[[Literal ((shared))]] ((shared))');
});
test('merging a graph with colliding IDs leaves a literal title intact',()=>{
  const existing=newPage('Existing'),incoming=newPage('Imported');existing.blocks[0].id='shared';incoming.blocks[0].id='shared';incoming.blocks[0].text='[[Literal ((shared))]] ((shared))';
  const data={version:1,pages:[existing]};mergeGraph(data,{version:1,pages:[incoming]});const added=data.pages.find(p=>p.title==='Imported').blocks[0];
  assert.notEqual(added.id,'shared');assert.equal(added.text,`[[Literal ((shared))]] ((${added.id}))`);
});
