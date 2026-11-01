import test from 'node:test';
import assert from 'node:assert/strict';
import {checkWritingRules,mergeWritingMatches} from '../web/writing-rules.js';
import {applySuggestion} from '../web/proofread.js';

test('the screenshot sentence receives two usable local suggestions without changing the source',()=>{
  const text='Ola tudo bem ?',matches=checkWritingRules(text,'pt-BR');
  assert.deepEqual(matches.map(match=>[match.offset,match.length,match.replacements[0].value]),[[0,3,'Olá'],[12,2,'?']]);
  assert.equal(text,'Ola tudo bem ?');
  let corrected=text;
  for(const match of [...matches].reverse())corrected=applySuggestion(corrected,match,match.replacements[0].value,corrected);
  assert.equal(corrected,'Olá tudo bem?');
  assert.match(matches[0].message,/Se a intenção é cumprimentar/);
});

test('Portuguese regional variants use the same narrow greeting rule',()=>{
  for(const language of ['pt','pt-BR','pt-PT'])for(const text of ['Ola, pessoal!','ola tudo bem?','Tudo certo. Ola, Ana!','Ola como vai?']){
    const matches=checkWritingRules(text,language);
    assert.equal(matches.length,1,`${language}: ${text}`);
    assert.equal(matches[0].replacements[0].value,'Olá');
  }
  for(const text of ['Ola chegou cedo.','Conheço Ola e Ana.','Ola é um nome.','a ola chegou','Olá tudo bem?','olaria','Olanda'])assert.deepEqual(checkWritingRules(text,'pt-BR'),[],text);
});

test('English pronoun capitalization requires a recognized prose context',()=>{
  for(const language of ['en','en-US','en-GB'])for(const text of ['i am learning.','When i write, I think.',"i'm here.",'i’ve learned something.']){
    const matches=checkWritingRules(text,language);
    assert.equal(matches.length,1,`${language}: ${text}`);assert.equal(matches[0].replacements[0].value,'I');
  }
  for(const text of ['i. Introduction','variable i = 2','the letter i','iPhone','I am here.','Ola tudo bem?'])assert.deepEqual(checkWritingRules(text,'en-US'),[],text);
  assert.deepEqual(checkWritingRules('i am here.','pt-BR'),[]);
});

test('spacing suggestions cover horizontal spaces only after a letter or number',()=>{
  const text='Olá , Ana ; tudo bem ? Sim ! Valor 2 : certo .';
  assert.deepEqual(checkWritingRules(text,'pt-PT').map(match=>match.replacements[0].value),[',',';','?','!',':','.']);
  assert.equal(checkWritingRules('Hello\t !','en-GB').length,1);
  assert.equal(checkWritingRules('Texto\u00a0?','pt').length,1);
  for(const value of ['texto\n?','🙂 ?','= ;','... !','&quest;','&#63;','Olá tudo bem?'])assert.deepEqual(checkWritingRules(value,'pt'),[],value);
  assert.deepEqual(checkWritingRules('Bonjour !','fr'),[]);
});

test('protected note syntax, addresses and URLs never receive local edits',()=>{
  const snippets=['[[Ola tudo bem ?]]','{{Ola tudo bem ?}}','`Ola tudo bem ?`','```\nOla tudo bem ?\n```','$$Ola tudo bem ?$$',
    '[[Ola tudo bem ?', '{{Ola tudo bem ?', '`Ola tudo bem ?', '((id))',
    'https://example.test/Ola?tudo=bem','ftp://example.test/i','www.example.test/i',
    'Ola@example.test','i@example.test','[destino](https://example.test/Ola)', '#Ola', 'Ola :: texto'];
  for(const text of snippets)for(const lang of ['pt-BR','en-US'])assert.deepEqual(checkWritingRules(text,lang),[],text);
  for(const address of ['https://example.test','ftp://example.test','www.example.test','Ola@example.test'])assert.deepEqual(checkWritingRules(address+' ?','pt-BR'),[],address);
  assert.equal(checkWritingRules('[texto ?](https://example.test)','pt-BR').length,1,'A natural-language Markdown label remains reviewable');
});

test('emoji and combining marks keep exact UTF-16 positions and safe replacements',()=>{
  const text='🙂 Ola tudo bem ?',matches=checkWritingRules(text,'pt-BR');
  assert.deepEqual(matches.map(match=>match.offset),[3,15]);
  assert.equal(applySuggestion(text,matches[0],'Olá',text),'🙂 Olá tudo bem ?');
  const english='📝 When i write.',match=checkWritingRules(english,'en')[0];
  assert.equal(match.offset,english.indexOf('i write'));
  assert.equal(applySuggestion(english,match,'I',english),'📝 When I write.');
  const combining='Cafe\u0301 ?';const space=checkWritingRules(combining,'pt')[0];
  assert.equal(space.offset,5);assert.equal(applySuggestion(combining,space,'?',combining),'Cafe\u0301?');
});

test('local context takes precedence over a conflicting dictionary or grammar result',()=>{
  const local=checkWritingRules('Ola tudo bem ?','pt-BR');
  const spell={offset:0,length:3,message:'Dictionary guess',replacements:[{value:'Onda'}]},grammar={offset:11,length:3,message:'Overlap'};
  const separate={offset:20,length:2,message:'Another word'};
  const merged=mergeWritingMatches(local,[spell,separate],[grammar]);
  assert.deepEqual(merged,[...local,separate]);assert.equal(merged[0],local[0]);
  assert.equal(spell.replacements[0].value,'Onda','Merging does not mutate supplied diagnostics');
  const insertion={offset:25,length:0,message:'Insert punctuation'};
  assert.equal(mergeWritingMatches(local,[insertion]).at(-1),insertion,'LanguageTool insertion suggestions remain usable');
});

test('unsupported inputs do not silently become correction candidates',()=>{
  assert.throws(()=>checkWritingRules(null,'pt'),/string/);
  assert.deepEqual(checkWritingRules('Ola tudo bem ?','de-DE'),[]);
  assert.deepEqual(mergeWritingMatches([{offset:-1,length:2},{offset:0,length:-1}]),[]);
});
