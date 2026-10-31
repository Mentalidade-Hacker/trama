import test from 'node:test';
import assert from 'node:assert/strict';
import {wordAtSelection} from '../web/live-writing.js';

test('dictionary shortcut reads the selected word or the word under the caret',()=>{
  const value='😀 A confiança vem com prática.';
  assert.equal(wordAtSelection({value,selectionStart:value.indexOf('confiança')+4,selectionEnd:value.indexOf('confiança')+4}),'confiança');
  assert.equal(wordAtSelection({value,selectionStart:value.indexOf('vem'),selectionEnd:value.indexOf('com')+3}),'vem com');
});
test('word selection handles accents, apostrophes and hyphenated words',()=>{
  for(const word of ['guarda-chuva','don’t','ação','confiança'])assert.equal(wordAtSelection({value:word+'.',selectionStart:2,selectionEnd:2}),word);
});
test('dictionary shortcut tolerates non-editable targets and punctuation',()=>{
  assert.equal(wordAtSelection(null),'');assert.equal(wordAtSelection({}),'');
  assert.equal(wordAtSelection({value:'... ',selectionStart:4,selectionEnd:4}),'');
});
