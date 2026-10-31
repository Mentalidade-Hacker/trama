import {protectedRanges} from './proofread.js';

export const MAX_SPELL_TEXT = 20000;
const WORD = /\p{L}[\p{L}\p{M}]*(?:['’\-][\p{L}\p{M}]+)*/gu;
const IDENTIFIER = /[\p{L}\p{M}\p{N}_]/u;

export function normalizeSpellingLanguage(language = 'pt-BR') {
  const key = String(language).toLowerCase().replace(/[-_]/g, '');
  const languages = {pt: 'pt-BR', ptbr: 'pt-BR', ptpt: 'pt-PT', en: 'en-US', enus: 'en-US', engb: 'en-GB'};
  if (!Object.hasOwn(languages, key)) throw Error('Escolha português do Brasil, português de Portugal, inglês americano ou britânico.');
  return languages[key];
}

export function normalizeSpellingWord(word) {
  return word.normalize('NFC').replace(/’/g, "'");
}

function validateText(text) {
  if (typeof text !== 'string') throw Error('O texto para revisão precisa ser uma string.');
  if (text.length > MAX_SPELL_TEXT) throw Error('A revisão automática aceita até 20 mil caracteres por bloco.');
}

/** Natural-language tokens, with positions in the original UTF-16 string. */
export function spellingTokens(text, {caret, checkCurrent = false, ignored = []} = {}) {
  validateText(text);
  const ranges = protectedRanges(text);
  // Addresses are identifiers, including addresses outside Markdown destinations.
  for (const match of text.matchAll(/[\p{L}\p{N}._%+\-]+@[\p{L}\p{N}.\-]+\.[\p{L}]{2,}/gu)) {
    ranges.push([match.index, match.index + match[0].length]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const personal = new Set((Array.isArray(ignored) ? ignored : []).slice(0, 5000)
    .filter(word => typeof word === 'string' && word.length <= 100)
    .map(word => normalizeSpellingWord(word).toLowerCase()));
  let rangeIndex = 0;
  const tokens = [];
  for (const match of text.matchAll(WORD)) {
    const word = match[0], offset = match.index, end = offset + word.length;
    // Do not check fragments of user IDs, version numbers, or underscored identifiers.
    if (IDENTIFIER.test(text[offset - 1] || '') || IDENTIFIER.test(text[end] || '')) continue;
    if (word.length > 100) continue;
    while (rangeIndex < ranges.length && ranges[rangeIndex][1] <= offset) rangeIndex++;
    if (rangeIndex < ranges.length && ranges[rangeIndex][0] < end) continue;
    if (!checkCurrent && Number.isInteger(caret) && caret >= offset && caret <= end) continue;
    const normalized = normalizeSpellingWord(word);
    if (personal.has(normalized.toLowerCase())) continue;
    tokens.push({word, normalized, offset, length: word.length});
  }
  return tokens;
}

/** Check only; expensive replacement suggestions are requested separately. */
export function checkSpelling(text, engine, options = {}) {
  const language = normalizeSpellingLanguage(options.language);
  const cache = new Map();
  const matches = [];
  for (const token of spellingTokens(text, options)) {
    if (!cache.has(token.normalized)) cache.set(token.normalized, engine.testSpelling(token.normalized));
    if (cache.get(token.normalized)) continue;
    matches.push({offset: token.offset, length: token.length, word: token.word,
      message: language.startsWith('pt') ? 'Esta palavra não foi encontrada no dicionário local.' : 'This word was not found in the local dictionary.',
      replacements: [], rule: {issueType: 'misspelling', id: `HUNSPELL_${language.replace('-', '_').toUpperCase()}`}});
  }
  return matches;
}

/** Suggestions may replace a token with several words, but never create note syntax. */
export function spellingSuggestions(word, engine) {
  if (typeof word !== 'string' || word.length > 64 || !/^\p{L}[\p{L}\p{M}]*(?:['’\-][\p{L}\p{M}]+)*$/u.test(word)) return [];
  const suggestions = engine.getSpellingSuggestions(normalizeSpellingWord(word));
  return [...new Set(suggestions.filter(value => typeof value === 'string' && value.length <= 150
    && /^[\p{L}\p{M}][\p{L}\p{M}\p{N} '’\-]*$/u.test(value)))].slice(0, 8).map(value => ({value}));
}
