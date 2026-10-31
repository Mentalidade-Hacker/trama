import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spellingTokens, checkSpelling, spellingSuggestions, normalizeSpellingLanguage} from '../web/spell-core.js';
import {createSpellingService} from '../web/spell-worker.js';
import {createHunspellFromStrings} from '../web/vendor/spelling/hunspell/dist/Hunspell.js';

test('tokens retain UTF-16 offsets with emoji, decomposed accents and contractions', () => {
  const text = "😀 coração don't d’água guarda-chuva";
  const tokens = spellingTokens(text);
  assert.deepEqual(tokens.map(token => token.word), ['coração', "don't", 'd’água', 'guarda-chuva']);
  assert.equal(tokens[0].offset, 3);
  assert.equal(tokens[0].normalized, 'coração');
  assert.equal(tokens[2].normalized, "d'água");
  for (const token of tokens) assert.equal(text.slice(token.offset, token.offset + token.length), token.word);
});

test('links, directives, code, math, attributes and identifiers are protected', () => {
  const text = 'Status:: errrado [[Ignnorar]] #ignorrrar ((abc123)) {{query: [[Ignnorar]]}} `codigoo` $$formullaa$$\n'
    + '[visivell](https://example.com/errrado) email@exemplo.com abc123 test_name 123abc **texte**';
  assert.deepEqual(spellingTokens(text).map(token => token.word), ['errrado', 'visivell', 'texte']);
  assert.deepEqual(spellingTokens('texto [[incompleto erro').map(token => token.word), ['texto']);
});

test('caret suppresses current token until boundary or explicit pause', () => {
  assert.deepEqual(spellingTokens('errrado', {caret: 7}), []);
  assert.deepEqual(spellingTokens('errrado', {caret: 3}), []);
  assert.equal(spellingTokens('errrado ', {caret: 8}).length, 1);
  assert.equal(spellingTokens('errrado', {caret: 7, checkCurrent: true}).length, 1);
  assert.equal(spellingTokens('errrado ', {caret: 0, checkCurrent: true}).length, 1);
});

test('personal words ignore case and canonical normalization without hiding others', () => {
  const tokens = spellingTokens('Trama coração coração Errrado', {ignored: ['trama', 'CORAÇÃO']});
  assert.deepEqual(tokens.map(token => token.word), ['Errrado']);
  assert.equal(normalizeSpellingLanguage('ptBR'), 'pt-BR');
  assert.equal(normalizeSpellingLanguage('en_gb'), 'en-GB');
  assert.equal(normalizeSpellingLanguage('pt'), 'pt-BR');
  assert.throws(() => normalizeSpellingLanguage('fr'), /Escolha/);
  assert.throws(() => spellingTokens('x'.repeat(20001)), /20 mil/);
  assert.throws(() => spellingTokens(null), /string/);
});

test('check deduplicates engine work and suggestions never create markup', () => {
  const checked = [];
  const engine = {testSpelling(word) {checked.push(word); return word === 'certo';},
    getSpellingSuggestions() {return ['errado', 'errado', 'duas palavras', '[[link]]', '<script>', 'line\nbreak', 'foo_bar'];}};
  const matches = checkSpelling('😀 errrado certo errrado', engine, {language: 'pt-BR'});
  assert.deepEqual(checked, ['errrado', 'certo']);
  assert.equal(matches[0].offset, 3);
  assert.equal(matches[0].length, 7);
  assert.equal(matches[0].rule.id, 'HUNSPELL_PT_BR');
  assert.deepEqual(matches[0].replacements, []);
  assert.deepEqual(spellingSuggestions('errrado', engine), [{value: 'errado'}, {value: 'duas palavras'}]);
  assert.deepEqual(spellingSuggestions('x'.repeat(65), engine), []);
  assert.deepEqual(spellingSuggestions('[[errrado]]', engine), []);
});

test('worker contract caches dictionary loads and requested suggestions, reports errors', async () => {
  let loads = 0, suggests = 0;
  const handle = createSpellingService({load: async language => {
    loads++; assert.equal(language, 'en-US');
    return {testSpelling: word => word === 'right', getSpellingSuggestions() {suggests++; return ['wrong'];}};
  }});
  const results = await Promise.all([1, 2].map(id => handle({id, action: 'check', text: 'wrng right', language: 'en', caret: 10})));
  assert.equal(loads, 1);
  assert.equal(results[0].id, 1);
  assert.equal(results[0].ready, true);
  assert.equal(results[0].matches[0].word, 'wrng');
  assert.equal(suggests, 0);
  const first = await handle({id: 3, action: 'suggest', word: 'wrng', language: 'en-US'});
  first.replacements[0].value = 'corrupted';
  const second = await handle({id: 4, action: 'suggest', word: 'wrng', language: 'en-US'});
  assert.deepEqual(second.replacements, [{value: 'wrong'}]);
  assert.equal(suggests, 1);
  assert.equal((await handle({id: 5, action: 'check', text: 'x'.repeat(20001)})).ready, false);
  assert.match((await handle({id: 6, action: 'delete'})).error, /desconhecida/);
  assert.equal((await handle(null)).ready, false);
});

test('failed dictionary loads can retry', async () => {
  let attempts = 0;
  const handle = createSpellingService({load: async () => {
    if (++attempts === 1) throw Error('offline file error');
    return {testSpelling: () => true};
  }});
  assert.equal((await handle({id: 1, action: 'check', text: 'casa'})).ready, false);
  assert.equal((await handle({id: 2, action: 'check', text: 'casa'})).ready, true);
  assert.equal(attempts, 2);
});

test('bundled actual Hunspell handles Portuguese affixes and both English variants', async t => {
  for (const language of ['pt-BR', 'pt-PT', 'en-US', 'en-GB']) {
    await t.test(language, async () => {
      const files = await Promise.all(['aff', 'dic'].map(extension => readFile(new URL(`../web/vendor/spelling/${language}/index.${extension}`, import.meta.url), 'utf8')));
      const start = performance.now();
      const engine = await createHunspellFromStrings(...files);
      t.diagnostic(`${language} initialization: ${Math.round(performance.now() - start)} ms`);
      try {
        if (language.startsWith('pt')) {
          assert.equal(engine.testSpelling('casa'), true);
          assert.equal(engine.testSpelling('corações'), true);
          assert.equal(engine.testSpelling('errrado'), false);
          assert.ok(spellingSuggestions('errrado', engine).some(item => item.value === 'errado'));
          const matches = checkSpelling('😀 corações errrado [[errrado]]', engine, {language});
          assert.deepEqual(matches.map(item => item.word), ['errrado']);
          assert.equal(matches[0].offset, 12);
        } else {
          assert.equal(engine.testSpelling('children'), true);
          assert.equal(engine.testSpelling('color'), language === 'en-US');
          assert.equal(engine.testSpelling('colour'), language === 'en-GB');
          assert.equal(engine.testSpelling('mispell'), false);
          assert.ok(spellingSuggestions('mispell', engine).some(item => item.value === 'misspell'));
        }
        const sentence = language.startsWith('pt') ? 'Esta casa tem corações e ideias. ' : 'This house has children and ideas. ';
        const text = sentence.repeat(Math.floor(20000 / sentence.length));
        const checkedAt = performance.now();
        checkSpelling(text, engine, {language});
        t.diagnostic(`${language} check ${text.length} UTF-16 units: ${Math.round(performance.now() - checkedAt)} ms`);
      } finally {engine.dispose();}
    });
  }
});
