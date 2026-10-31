import test from 'node:test';
import assert from 'node:assert/strict';
import { maskMarkup, protectedRanges, isProtectedRange, applySuggestion } from '../web/proofread.js';

test('mask preserves UTF-16 length, emoji offsets and line breaks', () => {
  const text = '😀 Eu vai a [[São Paulo 😀]].\nThey is ready. #trabalho';
  const masked = maskMarkup(text);
  assert.equal(masked.length, text.length);
  assert.equal(masked.indexOf('They'), text.indexOf('They'));
  assert.equal(masked.indexOf('\n'), text.indexOf('\n'));
  assert.ok(masked.startsWith('😀 Eu vai a '));
  assert.ok(!masked.includes('São Paulo'));
  const offset = text.indexOf('vai');
  assert.equal(applySuggestion(text, { offset, length: 3 }, 'vou', text), '😀 Eu vou a [[São Paulo 😀]].\nThey is ready. #trabalho');
});

test('all graph syntax and code are protected, including nested/incomplete markup', () => {
  for (const text of ['[[Page]]', '#ação', '#[[Minha página]]', '((block-id))', '{{embed: ((id))}}', '{{query: [[A]] #tag}}', '`const bad = 1`', '```js\nvar wrong = 1;\n```', '[[Outer [[Inner]] page]]', '{{nested {{x}} value}}', '[[unfinished', '`unfinished']) {
    assert.equal(maskMarkup(text), text.replace(/[^\r\n]/g, ' '), text);
    assert.equal(isProtectedRange(text, 1, 1), true, text);
    assert.throws(() => applySuggestion(text, { offset: 1, length: 1 }, 'X', text), /protegido/, text);
  }
});

test('Markdown labels stay correctable while destinations and syntax stay protected', () => {
  const text = 'Read [these page](https://example.com/foo_(bar)) and https://example.org/path.';
  const masked = maskMarkup(text);
  assert.ok(masked.includes('these page'));
  assert.ok(!masked.includes('https'));
  assert.equal(applySuggestion(text, { offset: 6, length: 5 }, 'this', text), 'Read [this page](https://example.com/foo_(bar)) and https://example.org/path.');
  for (const index of [text.indexOf('['), text.indexOf(']'), text.indexOf('https'), text.indexOf('example.org')]) {
    assert.equal(isProtectedRange(text, index, 1), true);
  }
});

test('Portuguese and English suggestions replace only the selected span', () => {
  const pt = 'Nós vai amanhã. Veja [[Reunião]].';
  assert.equal(applySuggestion(pt, { offset: 4, length: 3 }, 'vamos', pt), 'Nós vamos amanhã. Veja [[Reunião]].');
  const en = 'She have a plan. #project';
  assert.equal(applySuggestion(en, { offset: 4, length: 4 }, 'has', en), 'She has a plan. #project');
  assert.equal(applySuggestion('word word', { offset: 5, length: 4 }, '', 'word word'), 'word ');
  assert.equal(applySuggestion('Hello world', { offset: 5, length: 0 }, ',', 'Hello world'), 'Hello, world');
});

test('stale suggestions cannot silently alter a changed block', () => {
  assert.throws(() => applySuggestion('New content', { offset: 0, length: 3 }, 'Old', 'Old content'), /mudou/);
  assert.throws(() => applySuggestion('Same content', { offset: 0, length: 4 }, 'Old'), /mudou/);
});

test('invalid offsets and surrogate splits are rejected', () => {
  const text = '😀 word';
  for (const match of [{ offset: -1, length: 1 }, { offset: 0, length: -1 }, { offset: 99, length: 0 }, { offset: 5, length: 9 }, { offset: 0.5, length: 1 }, { offset: NaN, length: 1 }, { offset: 1, length: 1 }, { offset: 0, length: 1 }, { offset: 1, length: 0 }, { offset: 1e100, length: 0 }]) {
    assert.throws(() => applySuggestion(text, match, 'x', text), /inválida/);
    assert.equal(isProtectedRange(text, match.offset, match.length), true);
  }
  assert.equal(applySuggestion(text, { offset: 0, length: 2 }, '🙂', text), '🙂 word');
});

test('cross-boundary changes and insertions inside syntax are blocked', () => {
  const text = 'a [[Page]] b';
  assert.equal(isProtectedRange(text, 0, 4), true);
  assert.equal(isProtectedRange(text, 3, 0), true);
  assert.equal(isProtectedRange(text, 2, 0), false);
  assert.equal(isProtectedRange(text, 10, 0), false);
  assert.deepEqual(protectedRanges(text), [[2, 10]]);
  assert.throws(() => applySuggestion(text, { offset: 0, length: 4 }, 'x', text), /protegido/);
});

test('attribute names and separators are protected while values remain correctable', () => {
  const text = 'Status:: She have a plan.\n[[Work: status]]:: Nós vai amanhã.';
  const masked = maskMarkup(text);
  assert.ok(!masked.includes('Status'));
  assert.ok(masked.includes('She have a plan.'));
  assert.ok(masked.includes('Nós vai amanhã.'));
  for (const index of [0, text.indexOf('::'), text.indexOf('Work'), text.lastIndexOf('::')]) {
    assert.equal(isProtectedRange(text, index, 1), true);
  }
  assert.equal(applySuggestion(text, { offset: text.indexOf('have'), length: 4 }, 'has', text), text.replace('have', 'has'));
});

test('LaTeX, heading delimiters and template placeholders keep their original offsets', () => {
  const text = '## Wrong title\nFormula $$\\frac{a}{b} = c$$ remains. <%today%>\n$$unfinished';
  const masked = maskMarkup(text);
  assert.equal(masked.length, text.length);
  assert.ok(masked.includes('Wrong title'));
  assert.ok(masked.includes('remains.'));
  assert.ok(!masked.includes('frac'));
  assert.ok(!masked.includes('today'));
  assert.ok(!masked.includes('unfinished'));
  assert.equal(isProtectedRange(text, 0, 2), true);
  assert.equal(isProtectedRange(text, text.indexOf('Wrong'), 5), false);
  assert.throws(() => applySuggestion(text, { offset: text.indexOf('frac'), length: 4 }, 'fraction', text), /protegido/);
});
