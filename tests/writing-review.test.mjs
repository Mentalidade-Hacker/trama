import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewWriting} from '../web/writing-review.js';
const unavailable=async()=>{throw Error('Motor não instalado');};
test('manual review retains local spelling and contextual fixes when LanguageTool is missing',async()=>{
  const out=await reviewWriting('Ola tudo bem ? errrado','pt-BR',{spell:async()=>({matches:[{offset:15,length:7,replacements:[],rule:{issueType:'misspelling'}}]}),grammar:unavailable});
  assert.ok(out.matches.some(x=>x.replacements.some(r=>r.value==='Olá')));
  assert.ok(out.matches.some(x=>x.offset===15));assert.equal(out.warnings.length,1);
});
test('dictionary failure does not hide basic rules or report a complete spelling check',async()=>{
  const out=await reviewWriting('Ola tudo bem ?','pt-BR',{spell:unavailable,grammar:unavailable});
  assert.ok(out.matches.length>=2);assert.equal(out.warnings.length,2);
});
test('optional grammar results are combined without duplicate or protected matches',async()=>{
  const out=await reviewWriting('Ola tudo bem ? [[Ola]]','pt-BR',{spell:async()=>({matches:[]}),grammar:async()=>({matches:[{offset:0,length:3,replacements:[{value:'Olá'}]},{offset:16,length:3,replacements:[]}]})});
  assert.equal(out.matches.filter(x=>x.offset===0).length,1);assert.ok(out.matches.every(x=>x.offset<15));assert.deepEqual(out.warnings,[]);
});
test('review refuses oversized blocks before contacting services',async()=>{
  await assert.rejects(reviewWriting('x'.repeat(20001),'en-US',{spell:()=>{throw Error('should not run');},grammar:unavailable}),/20 mil/);
});
test('manual spelling provides replacements and deduplicates repeated word lookups',async()=>{
  let lookups=0;
  const spell=async request=>request.action==='check'?{matches:[0,8].map(offset=>({offset,length:7,replacements:[],rule:{issueType:'misspelling'}}))}:(lookups++,{replacements:[{value:'errado'}]});
  const out=await reviewWriting('errrado errrado','pt-BR',{spell,grammar:unavailable});
  assert.equal(lookups,1);assert.deepEqual(out.matches.map(x=>x.replacements),[[{value:'errado'}],[{value:'errado'}]]);
});
