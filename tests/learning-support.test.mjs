import test from 'node:test';
import assert from 'node:assert/strict';
import {correctionForStudy,partOfSpeechHelp} from '../web/learning-support.js';

test('a real spelling suggestion becomes a contextual study card without changing the source',()=>{
  const text='😀 Quero ampliar meu vocabulario.';
  const match={offset:text.indexOf('vocabulario'),length:11,replacements:[{value:'vocabulário'}],rule:{issueType:'misspelling'}};
  const card=correctionForStudy(text,match,'pt-BR');
  assert.equal(card.correction.before,text);
  assert.equal(card.correction.after,'😀 Quero ampliar meu vocabulário.');
  assert.equal(card.word,'vocabulário');
  assert.match(card.correction.explanation,/Uma sugestão/);
  assert.equal(card.language,'pt');
});
test('grammar cards keep the actual rule explanation and surrounding sentence',()=>{
  const card=correctionForStudy('This are useful.',{offset:5,length:3,replacements:[{value:'is'}],message:'The singular subject needs a singular verb.',rule:{issueType:'grammar'}},'en-US');
  assert.equal(card.word,'');assert.equal(card.correction.after,'This is useful.');
  assert.equal(card.correction.explanation,'The singular subject needs a singular verb.');
});
test('a study correction keeps only its own sentence, not unrelated errors nearby',()=>{
  const text='Start here. I want to improve my writting. This are another mistake.';
  const card=correctionForStudy(text,{offset:text.indexOf('writting'),length:8,replacements:[{value:'writing'}],rule:{issueType:'misspelling'}},'en-US');
  assert.equal(card.correction.before,'I want to improve my writting.');
  assert.equal(card.correction.after,'I want to improve my writing.');
});
test('long study excerpts retain both sides of the correction without copying a whole note',()=>{
  const text='a'.repeat(1000)+' erro '+'b'.repeat(1000);
  const card=correctionForStudy(text,{offset:1001,length:4,replacements:[{value:'acerto'}]},'pt-PT');
  assert.ok(card.correction.before.length<1100);assert.match(card.correction.after,/ acerto /);
  assert.ok(card.correction.before.startsWith('…'));assert.ok(card.correction.after.endsWith('…'));
});

test('correction excerpts preserve complete emoji at both length boundaries',()=>{
  for(const text of ['🙂'+'x'.repeat(498)+' erro','erro '+'x'.repeat(498)+'🙂 fim']){
    const offset=text.indexOf('erro');
    const card=correctionForStudy(text,{offset,length:4,replacements:[{value:'acerto'}]},'pt-BR');
    assert.ok(card.correction.before.includes('🙂'));assert.ok(card.correction.after.includes('🙂'));
    assert.ok(card.correction.before.isWellFormed());assert.ok(card.correction.after.isWellFormed());
  }
});
test('invalid suggestions and protected links cannot become misleading corrections',()=>{
  assert.throws(()=>correctionForStudy('[[Página]]',{offset:2,length:6,replacements:[{value:'Outra'}]},'pt-BR'),/protegido/);
  assert.throws(()=>correctionForStudy('texto',{offset:99,length:2,replacements:[{value:'outro'}]},'pt-BR'),/inválida/);
  assert.throws(()=>correctionForStudy('texto',{offset:0,length:5,replacements:[]},'pt-BR'),/sugestão/);
});
test('grammatical labels explain their practical role without guessing unknown labels',()=>{
  assert.match(partOfSpeechHelp('Substantivo'),/Nomeia/);
  assert.equal(partOfSpeechHelp('noun'),partOfSpeechHelp('Substantivo'));
  assert.equal(partOfSpeechHelp('substantivo feminino'),partOfSpeechHelp('Substantivo'));
  assert.equal(partOfSpeechHelp('unknown'), '');
});
