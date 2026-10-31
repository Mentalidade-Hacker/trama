import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../web/core.js';
import { prepareTranslation, restoreTranslation, saveTranslatedCopy, addVocabularyCard, validateTranslationText } from '../web/translation-core.js';

function fixture() {
  const page = C.newPage('Minha página');
  const first = C.newBlock('  Olá **mundo**! Veja [[Ideias]] e #tema.\nStatus:: ativo `const x = 1` $$x^2$$');
  first.heading = 2; first.alignment = 'center'; first.view = 'numbered'; first.collapsed = true;
  first.children = [C.newBlock(`Referência ((${first.id})) e [texto visível](https://example.com). {{query: [[Ideias]]}}`)];
  page.blocks = [first];
  return page;
}

test('translation changes only prose and preserves markup, whitespace, IDs and metadata', () => {
  const page = fixture(), snapshot = JSON.stringify(page), prepared = prepareTranslation(page);
  assert.ok(prepared.texts.includes('mundo'));
  assert.ok(!prepared.texts.some(text => /const x|Status|https|query|x\^2/.test(text)));
  assert.equal(prepared.texts.filter(text => text === 'Ideias').length, 1);
  const outputs = prepared.texts.map(text => ({ 'Minha página': 'My page', 'Olá': 'Hello', mundo: 'world', ativo: 'active', 'texto visível': 'visible text', Ideias: 'Ideas', tema: 'topic' }[text] || text));
  const result = restoreTranslation(prepared, outputs, page);
  assert.equal(result.title, 'My page');
  assert.equal(result.blocks[0].text, '  Hello **world**! Veja [Ideas]([[Ideias]]) e [topic]([[tema]]).\nStatus:: active `const x = 1` $$x^2$$');
  assert.equal(result.blocks[0].id, page.blocks[0].id);
  assert.equal(result.blocks[0].heading, 2);
  assert.equal(result.blocks[0].collapsed, true);
  assert.ok(result.blocks[0].children[0].text.includes('[visible text](https://example.com)'));
  assert.equal(JSON.stringify(page), snapshot);
});

test('long prose splits at <=1000 UTF-16 without breaking emoji or whitespace layout', () => {
  const page = C.newPage('Long');
  page.blocks[0].text = 'Primeira sentença. '.repeat(110) + '😀'.repeat(700) + ' final.\r\nOutra linha.';
  const prepared = prepareTranslation(page);
  assert.ok(prepared.texts.every(text => text.length <= 1000));
  assert.ok(prepared.texts.every(text => !/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/u.test(text)));
  assert.equal(restoreTranslation(prepared, prepared.texts).blocks[0].text, page.blocks[0].text);
});

test('counts, empty output, new graph syntax and stale snapshots are rejected', () => {
  const page = C.newPage('Source'), prepared = prepareTranslation(page);
  assert.throws(() => restoreTranslation(prepared, []), /quantidade/);
  for (const output of ['', '[[Injected]]', '#injected', '{{query: x}}', '`code`', 'A:: value', '[x](https://example.com)', 'new\nline']) {
    assert.throws(() => restoreTranslation(prepared, [output]), Error, output);
  }
  page.title = 'Changed';
  assert.throws(() => restoreTranslation(prepared, prepared.texts, page), /mudou/);
  const data = { version: 1, pages: [page] }, before = JSON.stringify(data);
  assert.throws(() => saveTranslatedCopy(data, prepared, prepared.texts), /mudou/);
  assert.equal(JSON.stringify(data), before);
});

test('translated copies get unique titles and remap internal references without changing source', () => {
  const page = fixture(), data = { version: 1, pages: [page] }, original = JSON.stringify(page), prepared = prepareTranslation(page);
  const copy = saveTranslatedCopy(data, prepared, prepared.texts, { language: 'en' });
  assert.equal(copy.title, 'Minha página · English');
  assert.notEqual(copy.id, page.id);
  assert.notEqual(copy.blocks[0].id, page.blocks[0].id);
  assert.ok(copy.blocks[0].children[0].text.includes(`((${copy.blocks[0].id}))`));
  assert.ok(copy.blocks[0].text.includes('[[Ideias]]'));
  assert.equal(JSON.stringify(page), original);
  const next = saveTranslatedCopy(data, prepared, prepared.texts, { language: 'en' });
  assert.equal(next.title, 'Minha página · English (2)');
});

test('learning cards are ordinary editable blocks with source and self-assessment', () => {
  const page = fixture(), data = { version: 1, pages: [page] };
  const card = addVocabularyCard(data, { original: 'Bom dia', translation: 'Good morning', sourcePageId: page.id, sourceBlockId: page.blocks[0].id, sourceLanguage: 'pt-BR', targetLanguage: 'en' });
  assert.equal(card.page.title, 'Vocabulário · Português e English');
  assert.ok(card.block.text.includes('#trama/vocabulario'));
  assert.ok(card.block.children.some(block => block.text.includes(`((${page.blocks[0].id}))`)));
  assert.ok(card.block.children.some(block => block.text.includes('sua própria avaliação')));
  assert.throws(() => addVocabularyCard(data, { original: '', translation: 'Good morning' }), /original/);
  assert.equal(data.pages.length, 2);
});

test('restoration rejects graph syntax assembled across protected boundaries', () => {
  const page = C.newPage('Title'); page.blocks[0].text = '[label](https://example.com)';
  const prepared = prepareTranslation(page), outputs = [...prepared.texts];
  outputs[outputs.indexOf('label')] = '[New page]';
  assert.throws(() => restoreTranslation(prepared, outputs), /junção/);
  page.blocks[0].text = '**word**';
  const formatted = prepareTranslation(page), translated = [...formatted.texts];
  translated[translated.indexOf('word')] = '*translated';
  assert.throws(() => restoreTranslation(formatted, translated), /junção/);
});

test('block IDs cannot collide with title mapping and protected spans cannot be forged', () => {
  const page = C.newPage('Page'); page.blocks[0].id = 'title'; page.blocks[0].text = 'Body [[Protected]]';
  const prepared = prepareTranslation(page), outputs = prepared.texts.map(text => text === 'Page' ? 'Página' : text === 'Body' ? 'Corpo' : text);
  const restored = restoreTranslation(prepared, outputs);
  assert.equal(restored.title, 'Página');
  assert.equal(restored.blocks[0].text, 'Corpo [[Protected]]');
  const forged = clonePrepared(prepared);
  forged.segments.push({ field: 'block', blockId: 'title', start: 7, end: 16 }); forged.texts.push('Protected');
  assert.throws(() => restoreTranslation(forged, [...outputs, 'Changed']), /mapeamento/);
});

function clonePrepared(value) { return JSON.parse(JSON.stringify(value)); }

test('translated direct link labels keep exact graph targets and exclude embedded syntax', () => {
  const page = C.newPage('Links');
  page.blocks[0].text = '[[Page]] #tag #[[Other page]] [existing]([[Target]]) `[[Code]]` $$[[Math]]$$ {{embed: [[Embed]]}}\n[[Attribute]]:: value';
  const prepared = prepareTranslation(page);
  const labels = prepared.segments.flatMap((segment, index) => segment.kind === 'link-label' ? [prepared.texts[index]] : []);
  assert.deepEqual(labels, ['Page', 'tag', 'Other page']);
  const output = prepared.texts.map(text => ({ Page: 'Página', tag: 'etiqueta', 'Other page': 'Outra página', existing: 'existente' }[text] || text));
  const translated = restoreTranslation(prepared, output);
  assert.ok(translated.blocks[0].text.includes('[Página]([[Page]])'));
  assert.ok(translated.blocks[0].text.includes('[etiqueta]([[tag]])'));
  assert.ok(translated.blocks[0].text.includes('[Outra página]([[Other page]])'));
  assert.ok(translated.blocks[0].text.includes('[existente]([[Target]])'));
  assert.deepEqual(C.extractLinks(translated.blocks[0].text).sort(), C.extractLinks(page.blocks[0].text).sort());
});

test('standalone automatic translations cannot introduce note syntax', () => {
  assert.equal(validateTranslationText('  Good morning!  '), 'Good morning!');
  assert.equal(validateTranslationText('Amanhã, nós vamos estudar inglês.'), 'Amanhã, nós vamos estudar inglês.');
  for (const value of ['[[New page]]', '#tag', '{{embed: [[Page]]}}', '`code`', '**new formatting**', 'Field:: value', '[label](https://example.com)', 'first\nsecond', '', null]) {
    assert.throws(() => validateTranslationText(value), Error);
  }
});
