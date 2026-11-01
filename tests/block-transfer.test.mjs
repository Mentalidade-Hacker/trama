import test from 'node:test';
import assert from 'node:assert/strict';
import {newPage,newBlock,findBlock} from '../web/core.js';
import {transferBlock} from '../web/block-transfer.js';
function fixture(){const a=newPage('A'),b=newPage('B');a.blocks[0].text='Original';return {data:{version:1,pages:[a,b]},a,b,source:a.blocks[0],target:b.blocks[0]};}
test('reference drag preserves original content and creates a distinct live reference',()=>{
  const f=fixture(),before=JSON.stringify(f.a);const out=transferBlock(f.data,f.source.id,f.target.id,{reference:true});
  assert.equal(JSON.stringify(f.a),before);assert.notEqual(out.blockId,f.source.id);assert.equal(findBlock(f.data,out.blockId).block.text,`((${f.source.id}))`);
  assert.deepEqual(out.pageIds,[f.b.id]);
  f.source.text='Changed';assert.equal(findBlock(f.data,f.source.id).block.text,'Changed');assert.equal(f.b.blocks.length,2);
});
test('normal drag moves a block and its descendants with stable identities',()=>{
  const f=fixture(),child=newBlock('child');f.source.children.push(child);transferBlock(f.data,f.source.id,f.target.id);
  assert.equal(f.b.blocks[1],f.source);assert.equal(findBlock(f.data,child.id).page.id,f.b.id);assert.equal(f.a.blocks.length,1);assert.notEqual(f.a.blocks[0].id,f.source.id);
});
test('moving within one sibling list uses the target position after removal',()=>{
  const f=fixture(),last=newBlock('last');f.a.blocks.push(last);transferBlock(f.data,f.source.id,last.id);
  assert.deepEqual(f.a.blocks.map(b=>b.id),[last.id,f.source.id]);
});
test('reference as child expands its parent and does not move the source',()=>{
  const f=fixture();f.target.collapsed=true;transferBlock(f.data,f.source.id,f.target.id,{reference:true,asChild:true});
  assert.equal(f.target.collapsed,false);assert.equal(f.target.children[0].text,`((${f.source.id}))`);assert.equal(f.a.blocks[0],f.source);
});
test('invalid and cyclic moves leave the graph unchanged',()=>{
  const f=fixture(),child=newBlock('child');f.source.children.push(child);const before=JSON.stringify(f.data);
  assert.throws(()=>transferBlock(f.data,f.source.id,child.id),/dentro de si/);assert.throws(()=>transferBlock(f.data,'missing',f.target.id),/disponível/);assert.throws(()=>transferBlock(f.data,f.source.id,f.source.id),/outro bloco/);assert.equal(JSON.stringify(f.data),before);
});
test('a reference cannot create an invalid hundred-and-first level',()=>{
  const f=fixture();let leaf=f.target;
  for(let i=1;i<100;i++){const child=newBlock('level '+i);leaf.children.push(child);leaf=child;}
  const before=JSON.stringify(f.data);assert.throws(()=>transferBlock(f.data,f.source.id,leaf.id,{reference:true,asChild:true}),/100 níveis/);assert.equal(JSON.stringify(f.data),before);
});
