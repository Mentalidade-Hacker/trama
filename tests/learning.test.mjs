import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../web/core.js';
import {WORD_LESSONS, WRITING_LESSONS} from '../web/learning-content.js';
import {LEARNING_PAGE, validateLesson, readLearning, readPracticeAttempt, learningStats, dueReviews, nextLesson, markLessonSeen,
  answerQuiz, savePractice, saveReviewCard, scheduleReview, recordReview, dictionaryLesson, createLearningWriter} from '../web/learning-core.js';

const now = '2026-11-01T12:00:00.000Z';
const graph = () => ({version:1,pages:[]});
const words = WORD_LESSONS.map(lesson => ({...lesson,kind:'word'}));
const lesson = words.find(item => item.language === 'pt');
const english = words.find(item => item.language === 'en');

test('reading progress and choosing activities do not create records or grant progress', () => {
  const data = graph(), before = JSON.stringify(data);
  assert.deepEqual(learningStats(data,'pt',now),{seen:0,practiced:0,attempts:0,due:0});
  assert.equal(nextLesson(words,data,'pt').id,lesson.id);
  assert.deepEqual(dueReviews(data,'pt',now),[]);
  assert.equal(JSON.stringify(data),before);
});

test('all authored lessons fit the portable learning contract', () => {
  for(const item of words) assert.equal(validateLesson(item).examples.length,2);
  for(const item of WRITING_LESSONS) assert.ok(validateLesson({...item,kind:'writing'}).after);
});

test('word rotation selects unseen items and then least recently seen, not a daily fixed item', () => {
  const data=graph(), pool=words.filter(item=>item.language==='pt').slice(0,3);
  markLessonSeen(data,pool[0],{now});
  assert.equal(nextLesson(pool,data,'pt',pool[0].id).id,pool[1].id);
  markLessonSeen(data,pool[1],{now:'2026-11-01T12:01:00Z'});
  markLessonSeen(data,pool[2],{now:'2026-11-01T12:02:00Z'});
  assert.equal(nextLesson(pool,data,'pt',pool[2].id).id,pool[0].id);
  assert.equal(learningStats(data,'pt',now).practiced,0);
});

test('quiz answers give actual feedback without granting writing practice or automatic mastery', () => {
  const data=graph(), wrong=(lesson.quiz.answer+1)%4;
  const result=answerQuiz(data,lesson,wrong,{now,operationId:'quiz-one'});
  assert.equal(result.correct,false);
  assert.equal(result.explanation,lesson.quiz.explanation);
  assert.equal(result.state.quizAttempts,1);
  assert.equal(result.state.attempts,0);
  assert.equal(result.state.dueAt,null);
  assert.ok(result.block.children.some(block=>block.children.some(child=>child.text.includes(lesson.quiz.options[wrong]))));
  const duplicate=answerQuiz(data,lesson,wrong,{now,operationId:'quiz-one'});
  assert.equal(duplicate.state.quizAttempts,1);
  assert.equal(answerQuiz(data,lesson,lesson.quiz.answer,{now,operationId:'quiz-two'}).correct,true);
});

test('own-sentence practice creates normal blocks and starts next-day review', () => {
  const data=graph();
  const result=savePractice(data,lesson,'Minha frase de teste.',{now,operationId:'attempt-one'});
  assert.equal(result.page.title,LEARNING_PAGE);
  assert.equal(result.state.attempts,1);
  assert.equal(result.state.dueAt,'2026-11-02T12:00:00.000Z');
  assert.equal(learningStats(data,'pt',now).practiced,1);
  assert.equal(dueReviews(data,'pt',now).length,0);
  assert.equal(dueReviews(data,'pt','2026-11-02T12:00:00Z').length,1);
  assert.equal(dueReviews(data,'en','2026-11-02T12:00:00Z').length,0);
  assert.ok(result.block.children.some(block=>block.children.some(child=>child.text==='Minha frase de teste.')));
  savePractice(data,lesson,'Minha frase de teste.',{now,operationId:'attempt-one'});
  assert.equal(readLearning(data).cards.get(lesson.id).state.attempts,1);
});

test('progress survives Trama and Roam import/export with only standard graph fields', () => {
  const data=graph();
  answerQuiz(data,lesson,lesson.quiz.answer,{now});
  savePractice(data,lesson,'Uma frase minha.',{now});
  const copy=C.importData(JSON.stringify(data));
  const roam=C.importData(C.exportRoam(data));
  for(const restored of [copy,roam]) {
    const card=readLearning(restored).cards.get(lesson.id);
    assert.equal(card.state.attempts,1);
    assert.equal(card.state.quizAttempts,1);
    assert.equal(card.state.lesson.meaning,lesson.meaning);
    assert.equal(card.state.dueAt,'2026-11-02T12:00:00.000Z');
    assert.deepEqual(Object.keys(card.block).sort(),['children','collapsed','id','text']);
  }
});

test('metadata and readable examples do not activate graph commands, refs or links from user prose', () => {
  const data=graph(), dangerous='[[Private]] ((block-id)) {{query: [[Secret]]}} #injected Key:: value ``` <script>';
  const custom=validateLesson({...lesson,id:'special',meaning:dangerous,prompt:dangerous,examples:[{text:dangerous,translation:dangerous}]});
  const card=savePractice(data,custom,dangerous,{now});
  assert.equal(readLearning(C.importData(data)).cards.get('special').state.lesson.meaning,dangerous);
  const references=C.walkBlocks(data.pages).flatMap(({block})=>C.extractRefs(block.text));
  const links=C.walkBlocks(data.pages).flatMap(({block})=>C.extractLinks(block.text));
  assert.deepEqual(references,[]);
  assert.deepEqual([...new Set(links)],['trama/aprender']);
  assert.ok(card.metadata.text.startsWith('```trama-learning-v1\n'));
});

test('invalid attempts and invalid quiz choices leave the graph untouched', () => {
  const data=graph(), before=JSON.stringify(data);
  for(const sentence of ['', '   ', 'x'.repeat(12001)]) assert.throws(()=>savePractice(data,lesson,sentence,{now}));
  for(const choice of [-1,4,0.5,'0']) assert.throws(()=>answerQuiz(data,lesson,choice,{now}));
  assert.throws(()=>savePractice(data,{...lesson,language:'fr'},'phrase',{now}));
  assert.throws(()=>markLessonSeen(data,lesson,{now:'invalid'}));
  assert.equal(JSON.stringify(data),before);
});

test('exact original practice syntax survives portable roundtrip without creating graph links', () => {
  const data=graph(), original='  Use [[Ideias]], ((bloco-original)), {{query: [[Tema]]}}, #literal, `código` e Campo:: valor.\nEmoji 😀; texto com ação.\n ';
  const result=savePractice(data,lesson,original,{now});
  const attempt=result.block.children.find(block=>block.text.startsWith('Minha escrita ·'));
  assert.equal(readPracticeAttempt(attempt).text,original);
  assert.notEqual(attempt.children[0].text,original);
  for(const restored of [C.importData(JSON.stringify(data)),C.importData(C.exportRoam(data))]) {
    const card=readLearning(restored).cards.get(lesson.id);
    const saved=card.block.children.find(block=>block.text.startsWith('Minha escrita ·'));
    assert.deepEqual(readPracticeAttempt(saved),{text:original,createdAt:now});
    assert.deepEqual([...new Set(C.walkBlocks(restored.pages).flatMap(({block})=>C.extractLinks(block.text)))],['trama/aprender']);
    assert.deepEqual(C.walkBlocks(restored.pages).flatMap(({block})=>C.extractRefs(block.text)),[]);
  }
});

test('correction reference is persisted only through an explicit action', () => {
  const data=graph();
  const correction=validateLesson({id:'correction-fixture',language:'pt',kind:'correction',title:'Uma escolha de escrita',before:'os texto',after:'os textos',explanation:'Ajuste de concordância de teste.',prompt:'Escreva outra frase aplicando a mudança.'});
  assert.equal(data.pages.length,0);
  saveReviewCard(data,correction,{now});
  const card=readLearning(data).cards.get(correction.id);
  assert.equal(card.state.lesson.before,'os texto');
  assert.equal(card.state.lesson.after,'os textos');
  assert.equal(card.state.attempts,0);
  assert.equal(dueReviews(data,'pt',now).length,1);
});

test('review requires revealing the reference and schedules self-assessment honestly', () => {
  const data=graph();saveReviewCard(data,lesson,{now});
  const before=JSON.stringify(data);
  assert.throws(()=>recordReview(data,lesson.id,'remembered',{now}),/Revele/);
  assert.equal(JSON.stringify(data),before);
  let result=recordReview(data,lesson.id,'remembered',{now,revealed:true});
  assert.equal(result.state.repetitions,1);
  assert.equal(result.state.dueAt,'2026-11-02T12:00:00.000Z');
  result=recordReview(data,lesson.id,'remembered',{now:'2026-11-02T12:00:00Z',revealed:true});
  assert.equal(result.state.intervalDays,3);
  assert.equal(result.state.dueAt,'2026-11-05T12:00:00.000Z');
  result=recordReview(data,lesson.id,'again',{now:'2026-11-05T12:00:00Z',revealed:true});
  assert.equal(result.state.repetitions,0);
  assert.equal(result.state.dueAt,'2026-11-05T12:10:00.000Z');
  assert.equal(scheduleReview({repetitions:100},'remembered',now).intervalDays,60);
});

test('imported numeric dates normalize before sorting; damaged records are ignored', () => {
  const data=graph(), card=savePractice(data,lesson,'Texto',{now});
  const payload=JSON.parse(card.metadata.text.slice('```trama-learning-v1\n'.length,-4));
  payload.lastSeenAt=Date.parse(now);payload.createdAt=Date.parse(now);payload.dueAt=Date.parse(now);
  card.metadata.text='```trama-learning-v1\n'+JSON.stringify(payload)+'\n```';
  assert.equal(readLearning(data).cards.get(lesson.id).state.lastSeenAt,now);
  assert.equal(dueReviews(data,'pt',now).length,1);
  assert.ok(nextLesson(words,data,'pt'));
  card.metadata.text='```trama-learning-v1\n{}\n```';
  assert.equal(readLearning(data).cards.size,0);
});

test('dictionary practice uses source examples only and does not invent a definition or quiz', () => {
  const missing=dictionaryLesson('testword','en',{found:false,entries:[]});
  assert.equal(missing.meaning,'');assert.deepEqual(missing.examples,[]);assert.equal(missing.quiz,undefined);
  const actual=dictionaryLesson('testword','en',{entries:[{partOfSpeech:'noun',definitions:[{definition:'Fixture meaning',examples:[{text:'Fixture sentence.'}]}],source:{name:'Fixture source',url:'https://example.com/word',license:'CC BY-SA 4.0',licenseUrl:'https://creativecommons.org/licenses/by-sa/4.0/'}}]});
  assert.equal(actual.examples[0].text,'Fixture sentence.');
  assert.equal(actual.examples[0].translation,'');
  assert.equal(actual.source.url,'https://example.com/word');
  assert.equal(actual.quiz,undefined);
});

function context(flushes) {
  let data=graph(), checkpoints=0, changes=0;
  return {get data(){return data;},replace(next){data=next;},checkpoint(){checkpoints++;},changed(){changes++;},render(){},
    async flush(){return flushes.length?flushes.shift():true;},get checkpoints(){return checkpoints;},get changes(){return changes;}};
}

test('pending disk failure retries the same record without a duplicate attempt', async () => {
  const ctx=context([true,false,true]), writer=createLearningWriter(ctx);
  await assert.rejects(writer.commit(data=>savePractice(data,lesson,'A saved attempt.',{now})),/ainda não foi salvo/);
  assert.ok(writer.pending);
  assert.equal(readLearning(ctx.data).cards.get(lesson.id).state.attempts,1);
  const result=await writer.retry();
  assert.equal(result.state.attempts,1);assert.equal(writer.pending,null);
  assert.equal(ctx.checkpoints,1);assert.equal(ctx.changes,1);
});

test('existing save conflict prevents a new mutation or progress increase', async () => {
  const ctx=context([false]), writer=createLearningWriter(ctx);let called=false;
  await assert.rejects(writer.commit(data=>{called=true;return savePractice(data,lesson,'Texto',{now});}),/conflito/);
  assert.equal(called,false);assert.equal(ctx.data.pages.length,0);assert.equal(writer.pending,null);
});

test('replaced or edited pending records never report false success and unblock new attempts', async () => {
  for(const replace of [true,false]) {
    const ctx=context([true,false]), writer=createLearningWriter(ctx);
    await assert.rejects(writer.commit(data=>savePractice(data,lesson,'Draft retained by UI.',{now})));
    if(replace)ctx.replace(graph());else writer.pending.block.text='Changed externally';
    await assert.rejects(writer.retry(),/cancelado/);
    assert.equal(writer.pending,null);
    const result=await writer.commit(data=>savePractice(data,english,'Another attempt.',{now}));
    assert.equal(result.state.attempts,1);
  }
});

test('writer stays busy until the actual disk confirmation resolves', async () => {
  let resolveSave, calls=0;
  const ctx=context([]);
  ctx.flush=()=>++calls===1?Promise.resolve(true):new Promise(resolve=>{resolveSave=resolve;});
  const writer=createLearningWriter(ctx), saving=writer.commit(data=>savePractice(data,lesson,'Texto',{now}));
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(writer.busy,true);assert.ok(writer.pending);
  await assert.rejects(writer.commit(data=>savePractice(data,lesson,'Duplicate',{now})),/pendente/);
  resolveSave(true);await saving;
  assert.equal(writer.busy,false);assert.equal(writer.pending,null);
});
