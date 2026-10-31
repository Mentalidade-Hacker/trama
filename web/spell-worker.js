import {createHunspellFromStrings, getWasmModule} from './vendor/spelling/hunspell/dist/Hunspell.js';
import {checkSpelling, spellingSuggestions, normalizeSpellingLanguage, normalizeSpellingWord, MAX_SPELL_TEXT} from './spell-core.js';

let wasmReady;
async function loadDictionary(language) {
  const files = await Promise.all(['aff', 'dic'].map(async extension => {
    const response = await fetch(new URL(`./vendor/spelling/${language}/index.${extension}`, import.meta.url));
    if (!response.ok) throw Error('Não foi possível abrir o dicionário local. Reabra o aplicativo.');
    return response.text();
  }));
  // The upstream initializer caches its result, but not an in-flight Promise.
  // Serialize the first initialization even when two languages are requested together.
  if (!wasmReady) wasmReady = getWasmModule().catch(error => { wasmReady = undefined; throw error; });
  await wasmReady;
  const hunspell = await createHunspellFromStrings(...files);
  const checked = new Map();
  return {
    testSpelling(word) {
      if (checked.has(word)) return checked.get(word);
      const correct = hunspell.testSpelling(word);
      if (checked.size >= 4096) checked.delete(checked.keys().next().value);
      checked.set(word, correct);
      return correct;
    },
    getSpellingSuggestions: word => hunspell.getSpellingSuggestions(word)
  };
}

/** Injectable loader keeps the message contract independently testable. */
export function createSpellingService({load = loadDictionary} = {}) {
  const dictionaries = new Map(), suggested = new Map();
  async function dictionary(language) {
    if (!dictionaries.has(language)) {
      const pending = Promise.resolve().then(() => load(language)).catch(error => {
        dictionaries.delete(language);
        throw error;
      });
      dictionaries.set(language, pending);
    }
    return dictionaries.get(language);
  }
  return async function handle(request) {
    const id = request?.id;
    try {
      if (!request || typeof request !== 'object') throw Error('Pedido de revisão inválido.');
      const {action} = request, language = normalizeSpellingLanguage(request.language);
      if (action !== 'check' && action !== 'suggest') throw Error('Ação de revisão desconhecida.');
      if (action === 'check' && (typeof request.text !== 'string' || request.text.length > MAX_SPELL_TEXT)) {
        throw Error('A revisão automática aceita texto de até 20 mil caracteres por bloco.');
      }
      if (action === 'suggest' && (typeof request.word !== 'string' || request.word.length > 64)) {
        return {id, ready: true, language, word: request.word, replacements: []};
      }
      const engine = await dictionary(language);
      if (action === 'check') {
        return {id, ready: true, language, matches: checkSpelling(request.text, engine, {...request, language})};
      }
      const key = `${language}:${normalizeSpellingWord(request.word)}`;
      if (!suggested.has(key)) {
        if (suggested.size >= 256) suggested.delete(suggested.keys().next().value);
        suggested.set(key, spellingSuggestions(request.word, engine));
      }
      return {id, ready: true, language, word: request.word, replacements: suggested.get(key).map(item => ({...item}))};
    } catch (error) {
      return {id, ready: false, matches: [], error: error instanceof Error ? error.message : 'O corretor local não conseguiu iniciar.'};
    }
  };
}

export const handleSpellRequest = createSpellingService();
if (typeof self !== 'undefined' && typeof self.postMessage === 'function' && typeof document === 'undefined') {
  self.addEventListener('message', async event => self.postMessage(await handleSpellRequest(event.data)));
}
