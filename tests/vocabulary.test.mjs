import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../web/core.js';
import {readLearning,recordReview,dueReviews,validateLesson} from '../web/learning-core.js';
import {VOCABULARY_FAMILIES} from '../web/vocabulary-data.js';
import {SUGGESTED_VOCABULARY_PAGE,vocabularyTokens,scanVocabulary,vocabularyChoice,prepareVocabularyChange,commitVocabularyChange,createVocabularyWriter} from '../web/vocabulary-suggestions.js';

const now='2026-11-01T12:00:00.000Z';
function fixture(text='Este resultado é importante. Outro resultado importante merece atenção.'){
  const page=C.newPage('Texto de estudo'),block=page.blocks[0];block.text=text;return {data:{version:1,pages:[page]},page,block};
}
function select(f,word='importante',alternativeId='relevante',occurrence=0,language='pt'){
  const group=scanVocabulary(f.data,{pageId:f.page.id,language,maxGroups:100}).groups.find(item=>item.word===word);
  assert.ok(group,word);return {...group.occurrences[occurrence],familyId:group.familyId,alternativeId};
}

test('curated collection has balanced PT/EN coverage, matching inflections, meanings and authored examples',()=>{
  assert.equal(VOCABULARY_FAMILIES.filter(item=>item.language==='pt').length,20);
  assert.equal(VOCABULARY_FAMILIES.filter(item=>item.language==='en').length,20);
  const ids=new Set();
  for(const family of VOCABULARY_FAMILIES){
    assert.ok(!ids.has(family.id));ids.add(family.id);assert.ok(family.partOfSpeech);
    for(const alternative of family.alternatives){
      assert.equal(alternative.forms.length,family.forms.length);
      assert.ok(alternative.meaning.length>10);assert.ok(alternative.usage.length>20);
      assert.ok(alternative.examples.length);assert.ok(alternative.examples[0].text.endsWith('.'));
      for(const word of alternative.forms)assert.match(word,/^[\p{L}\p{M}]+$/u);
      assert.doesNotThrow(()=>validateLesson({id:family.id+alternative.id,language:family.language,kind:'word',word:alternative.word,meaning:alternative.meaning,usage:alternative.usage,examples:alternative.examples,prompt:'Escreva outra frase.'}));
    }
  }
});

test('repetition ignores articles and syntax, while simple curated words appear even once',()=>{
  const f=fixture('A casa e a rua. A casa é importante. [[casa]] #casa `casa` {{embed: [[casa]]}}');
  const before=JSON.stringify(f.data),result=scanVocabulary(f.data,{pageId:f.page.id,language:'pt'});
  const repetition=result.groups.find(item=>item.word==='casa');assert.equal(repetition.count,2);assert.equal(repetition.reason,'repetition');
  const optional=result.groups.find(item=>item.word==='importante');assert.equal(optional.count,1);assert.equal(optional.reason,'optional');
  assert.ok(!result.groups.some(item=>['a','e'].includes(item.word)));assert.equal(JSON.stringify(f.data),before);
});

test('protection includes labels, destinations, names of attributes, email, formulas, unfinished code and commands',()=>{
  const source='[[good]] #good ((good)) {{query: good}} [good](https://good.example/good) [good]([[Target]]) good@good.com HTTPS://good.example/good\nGood:: value\n$$good$$\n`good`\n```js\ngood';
  const words=vocabularyTokens(source,'en').filter(token=>token.normalized==='good');assert.deepEqual(words,[]);
  const f=fixture(source);assert.ok(!scanVocabulary(f.data,{pageId:f.page.id,language:'en'}).groups.some(group=>group.word==='good'));
});

test('language and block scope are explicit and nested blocks keep their identity',()=>{
  const f=fixture('This is important. This point is important.');
  const child=C.newBlock('Um bom começo.');f.block.children=[child];
  assert.ok(scanVocabulary(f.data,{pageId:f.page.id,language:'en-US'}).groups.some(group=>group.word==='important'));
  assert.ok(!scanVocabulary(f.data,{blockId:child.id,language:'en'}).groups.some(group=>group.familyId));
  const onlyChild=scanVocabulary(f.data,{blockId:child.id,language:'pt-PT'});assert.equal(onlyChild.groups[0].word,'bom');assert.equal(onlyChild.groups[0].occurrences[0].blockId,child.id);
});

test('one selected occurrence changes, with UTF-16 offsets, case and plural preserved',()=>{
  const f=fixture('😀 IMPORTANTES: pontos importantes; outro importante.');
  const chosen=select(f,'importante','relevante',1),before=JSON.stringify(f.data);
  assert.equal(f.block.text.slice(chosen.offset,chosen.offset+chosen.length),'importantes');
  const prepared=prepareVocabularyChange(f.data,chosen,{now,operationId:'selection-one'});
  assert.equal(JSON.stringify(f.data),before);
  assert.equal(C.findBlock(prepared.data,f.block.id).block.text,'😀 IMPORTANTES: pontos relevantes; outro importante.');
  commitVocabularyChange(f.data,prepared);
  assert.equal(C.findBlock(f.data,f.block.id).block.text,'😀 IMPORTANTES: pontos relevantes; outro importante.');
  assert.equal(vocabularyChoice({...chosen,offset:3,length:11}).replacement,'RELEVANTES');
});

test('acceptance creates a review card without granting writing practice, and deduplicates later occurrences',()=>{
  const f=fixture('Um ponto importante. Outro ponto importante.');
  const first=prepareVocabularyChange(f.data,select(f),{now,operationId:'first'});commitVocabularyChange(f.data,first);
  let card=readLearning(f.data).cards.get(first.lessonId);
  assert.equal(card.state.attempts,0);assert.equal(card.state.repetitions,0);assert.equal(card.state.dueAt,now);assert.equal(dueReviews(f.data,'pt',now).length,1);
  assert.ok(card.block.children.some(block=>block.text.includes(`((${f.block.id}))`)));
  const library=C.findPage(f.data,SUGGESTED_VOCABULARY_PAGE);assert.ok(library);assert.equal(library.blocks.length,1);
  assert.ok(library.blocks[0].text.startsWith('relevante '));
  assert.ok(library.blocks[0].children.some(block=>block.text.includes(`((${card.block.id}))`)));
  assert.ok(library.blocks[0].children.some(block=>block.text.startsWith('Fonte: alternativas e exemplos autorais')));
  recordReview(f.data,first.lessonId,'remembered',{now,revealed:true});
  const due=readLearning(f.data).cards.get(first.lessonId).state.dueAt;
  const second=prepareVocabularyChange(f.data,select(f),{now:'2026-11-01T13:00:00Z',operationId:'second'});commitVocabularyChange(f.data,second);
  assert.equal(readLearning(f.data).cards.size,1);card=readLearning(f.data).cards.get(first.lessonId);
  assert.equal(card.state.dueAt,due);assert.equal(card.state.repetitions,1);assert.equal(card.state.attempts,0);
  assert.equal(card.block.children.filter(block=>block.text.startsWith('Origem:')).length,1);
  assert.equal(C.findPage(f.data,SUGGESTED_VOCABULARY_PAGE).blocks.length,1);
  assert.equal(C.findPage(C.importData(f.data),SUGGESTED_VOCABULARY_PAGE).blocks.length,1);
});

test('saved excerpts never split an emoji at either context boundary',()=>{
  for(const text of ['🙂'+'x'.repeat(98)+' importante.','importante '+'x'.repeat(138)+'🙂 fim']){
    const f=fixture(text),prepared=prepareVocabularyChange(f.data,select(f),{now});
    const card=readLearning(prepared.data).cards.get(prepared.lessonId);
    assert.ok(card.state.lesson.before.includes('🙂'));assert.ok(card.state.lesson.after.includes('🙂'));
    assert.ok(card.state.lesson.before.isWellFormed());assert.ok(card.state.lesson.after.isWellFormed());
    for(const {block} of C.walkBlocks(prepared.data.pages))assert.ok(block.text.isWellFormed());
  }
});

test('stale text, changed graphs and incomplete paired plans reject without losing either side',()=>{
  const f=fixture(),chosen=select(f);f.block.text+=' edição';const unchanged=JSON.stringify(f.data);
  assert.throws(()=>prepareVocabularyChange(f.data,chosen,{now}),/mudou/);assert.equal(JSON.stringify(f.data),unchanged);
  const plan=prepareVocabularyChange(f.data,select(f),{now});f.page.title='Outro título';const changed=JSON.stringify(f.data);
  assert.throws(()=>commitVocabularyChange(f.data,plan),/grafo mudou/);assert.equal(JSON.stringify(f.data),changed);
  const complete=prepareVocabularyChange(f.data,select(f),{now});complete.data.pages=complete.data.pages.filter(page=>page.id===f.page.id);
  assert.throws(()=>commitVocabularyChange(f.data,complete),/cartão/);assert.equal(JSON.stringify(f.data),changed);
});

test('selection cannot replace a substring, protected syntax or a different family',()=>{
  const f=fixture('importante [[importante]] importante123'),chosen=select(f);
  for(const invalid of [{...chosen,length:5},{...chosen,offset:f.block.text.indexOf('[[importante]]')+2},{...chosen,familyId:'pt-bom'},{...chosen,alternativeId:'<script>'}]){
    const before=JSON.stringify(f.data);assert.throws(()=>prepareVocabularyChange(f.data,invalid,{now}));assert.equal(JSON.stringify(f.data),before);
  }
});

test('English alternatives keep inflection and refuse a known article mismatch rather than editing extra text',()=>{
  const f=fixture('A good method shows good results.'),choice=select(f,'good','effective',0,'en');
  assert.match(vocabularyChoice(choice).adjustment,/artigo/);assert.throws(()=>prepareVocabularyChange(f.data,choice,{now}),/artigo/);
  const useful=prepareVocabularyChange(f.data,{...choice,alternativeId:'useful'},{now});assert.match(C.findBlock(useful.data,f.block.id).block.text,/A useful method/);
  const verb=select(f,'show','demonstrate',0,'en');assert.equal(vocabularyChoice(verb).replacement,'demonstrates');
});

function writerContext(f,results){let changes=0,checkpoints=0;return {data:f.data,changed(){changes++;},checkpoint(){checkpoints++;},render(){},flush:async()=>results.length?results.shift():true,get changes(){return changes;},get checkpoints(){return checkpoints;}};}
test('failed disk save keeps word and card together; retry saves once without duplicating the card',async()=>{
  const f=fixture(),ctx=writerContext(f,[true,false,true]),writer=createVocabularyWriter(ctx);
  await assert.rejects(writer.commit(select(f),{now,operationId:'paired-operation'}),/palavra e o cartão/);
  assert.ok(writer.pending);assert.match(C.findBlock(ctx.data,f.block.id).block.text,/relevante/);assert.equal(readLearning(ctx.data).cards.size,1);
  const result=await writer.retry();assert.equal(writer.pending,null);assert.equal(readLearning(ctx.data).cards.size,1);
  assert.equal(readLearning(ctx.data).cards.get(result.lessonId).state.operations.filter(id=>id==='paired-operation').length,1);
  assert.equal(ctx.checkpoints,1);assert.equal(ctx.changes,1);
});

test('an existing save conflict prevents both the replacement and the card',async()=>{
  const f=fixture(),before=JSON.stringify(f.data),ctx=writerContext(f,[false]),writer=createVocabularyWriter(ctx);
  await assert.rejects(writer.commit(select(f),{now}),/conflito/);assert.equal(JSON.stringify(f.data),before);assert.equal(writer.pending,null);assert.equal(ctx.checkpoints,0);
});

test('editing while the initial save is in flight makes the proposed occurrence stale',async()=>{
  const f=fixture();let resolve;const ctx=writerContext(f,[]);ctx.flush=()=>new Promise(done=>{resolve=done;});const writer=createVocabularyWriter(ctx),task=writer.commit(select(f),{now});
  f.block.text+=' uma edição posterior';resolve(true);await assert.rejects(task,/mudou/);assert.equal(readLearning(f.data).cards.size,0);assert.equal(ctx.changes,0);
});

test('removing a pending card cannot be reported as a successful paired retry',async()=>{
  const f=fixture(),ctx=writerContext(f,[true,false,true]),writer=createVocabularyWriter(ctx);
  await assert.rejects(writer.commit(select(f),{now}));f.data.pages=f.data.pages.filter(page=>page.id===f.page.id);
  await assert.rejects(writer.retry(),/cartão mudou/);assert.equal(writer.pending,null);
});

test('missing vocabulary entry prevents partial commit or a false successful retry',async()=>{
  const f=fixture(),before=JSON.stringify(f.data),prepared=prepareVocabularyChange(f.data,select(f),{now});
  prepared.data.pages=prepared.data.pages.filter(page=>page.title!==SUGGESTED_VOCABULARY_PAGE);
  assert.throws(()=>commitVocabularyChange(f.data,prepared),/vocabulário/);assert.equal(JSON.stringify(f.data),before);
  const ctx=writerContext(f,[true,false,true]),writer=createVocabularyWriter(ctx);await assert.rejects(writer.commit(select(f),{now}));
  assert.ok(C.findPage(f.data,SUGGESTED_VOCABULARY_PAGE));f.data.pages=f.data.pages.filter(page=>page.title!==SUGGESTED_VOCABULARY_PAGE);
  await assert.rejects(writer.retry(),/cartão mudou/);assert.equal(writer.pending,null);
});
