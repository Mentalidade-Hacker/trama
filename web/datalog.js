import { extractLinks, extractRefs } from './core.js';

// The official DataScript JS API stores attribute names as strings. This bridge
// translates only the known Roam-style attribute tokens, leaving EDN syntax intact.
const ATTRIBUTES = new Set([':node/title', ':block/uid', ':block/string', ':block/page', ':block/children', ':block/refs', ':block/order', ':create/time', ':edit/time', ':block/heading', ':block/open']);
const SCHEMA = {
  ':node/title': { ':db/unique': ':db.unique/identity' },
  ':block/uid': { ':db/unique': ':db.unique/identity' },
  ':block/page': { ':db/valueType': ':db.type/ref' },
  ':block/children': { ':db/valueType': ':db.type/ref', ':db/cardinality': ':db.cardinality/many' },
  ':block/refs': { ':db/valueType': ':db.type/ref', ':db/cardinality': ':db.cardinality/many' },
};
let cachedSnapshot = null, cachedDB = null, cachedEngine = null;
const cachedQueries = new Map();
const SAFE_CALLS = new Set(`= == not= != < > <= >= + - * / quot rem mod inc dec max min zero? pos? neg? even? odd? compare rand rand-int true? false? nil? some? not and or identical? identity keyword name namespace vector list set hash-map array-map count range not-empty empty? contains? str subs get pr-str print-str println-str prn-str re-find re-matches re-seq re-pattern -differ? get-else get-some missing? ground clojure.string/blank? clojure.string/includes? clojure.string/starts-with? clojure.string/ends-with? tuple untuple not-join or-join pull sum avg median variance stddev distinct count-distinct sample`.split(' '));

function rejectHostFunctions(query) {
  // DataScript permits bound JS functions. In particular, (type (type ...)) can
  // expose the host Function constructor. Only declarative/built-in calls belong
  // in a note: never allow dynamic invocation, host type introspection, or custom
  // aggregate functions. Inspect syntax only; quoted note text is left alone.
  let syntax = '', quoted = false, escaped = false, comment = false;
  for (const char of query) {
    if (comment) { syntax += char === '\n' ? '\n' : ' '; if (char === '\n') comment = false; continue; }
    if (quoted) {
      syntax += ' ';
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === ';') { comment = true; syntax += ' '; }
    else if (char === '"') { quoted = true; syntax += ' '; }
    else syntax += char;
  }
  // Reader-discard/metadata/quoting can change which symbol heads a list; they
  // are unnecessary for note queries and deliberately excluded from this bridge.
  if (/#[_='?(]|[\\\^`~']/u.test(syntax)) throw new Error('Esta forma de leitura EDN não é permitida nas consultas locais.');
  for (const match of syntax.matchAll(/\([\s,]*([^\s,()[\]{}]+)/gu)) {
    if (!SAFE_CALLS.has(match[1])) {
      throw new Error(`Função Datalog não permitida: ${match[1]}. Use as funções declarativas suportadas; chamadas dinâmicas, introspecção e agregadores personalizados são bloqueados.`);
    }
  }
}

function bridgeAttributes(query) {
  let output = '', index = 0, string = false, escaped = false, comment = false;
  while (index < query.length) {
    const char = query[index];
    if (comment) { output += char; index++; if (char === '\n') comment = false; continue; }
    if (string) {
      output += char; index++;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') string = false;
      continue;
    }
    if (char === ';') { comment = true; output += char; index++; continue; }
    if (char === '"') { string = true; output += char; index++; continue; }
    if (char === ':') {
      const token = query.slice(index).match(/^:[^\s\[\]{}(),;"']+/u)?.[0];
      if (token) { output += ATTRIBUTES.has(token) ? JSON.stringify(token) : token; index += token.length; continue; }
    }
    output += char; index++;
  }
  return output;
}

function modelDB(data, engine) {
  if (!data || !Array.isArray(data.pages) || data.pages.length > 50000) throw new Error('Grafo inválido ou com mais de 50.000 páginas.');
  const entities = [], ids = new Map(), pagesByTitle = new Map();
  const fold = value => value.normalize('NFC').toLocaleLowerCase('pt-BR');
  function register(item, page, parent = null, order = 0) {
    if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id)) throw new Error('Grafo com identificadores inválidos ou duplicados.');
    const id = entities.length + 1;
    ids.set(item.id, id); entities.push({ id, item, page, parent, order });
    return id;
  }
  for (const page of data.pages) {
    if (typeof page.title !== 'string' || !Array.isArray(page.blocks)) throw new Error('Página inválida para consulta Datalog.');
    const title = fold(page.title);
    if (pagesByTitle.has(title)) throw new Error('Título de página duplicado.');
    pagesByTitle.set(title, register(page, null));
  }
  let blockCount = 0;
  for (const page of data.pages) {
    const pending = page.blocks.map((item, order) => ({ item, order, parent: page, depth: 0 })).reverse();
    while (pending.length) {
      const { item, parent, order, depth } = pending.pop();
      if (++blockCount > 200000 || depth > 100) throw new Error('Datalog suporta até 200.000 blocos e 100 níveis.');
      if (typeof item?.text !== 'string' || !Array.isArray(item.children)) throw new Error('Bloco inválido para consulta Datalog.');
      register(item, page, parent, order);
      for (let index = item.children.length - 1; index >= 0; index--) pending.push({ item: item.children[index], parent: item, order: index, depth: depth + 1 });
    }
  }
  const datoms = [];
  for (const { id, item, page, parent, order } of entities) {
    datoms.push([id, ':block/uid', item.id]);
    if (!page) {
      datoms.push([id, ':node/title', item.title]);
      for (const [field, attribute] of [['created', ':create/time'], ['updated', ':edit/time']]) {
        const time = new Date(item[field]).getTime();
        if (Number.isFinite(time)) datoms.push([id, attribute, time]);
      }
    } else {
      datoms.push([id, ':block/string', item.text], [id, ':block/page', ids.get(page.id)], [id, ':block/order', order], [id, ':block/open', !item.collapsed], [ids.get(parent.id), ':block/children', id]);
      if (Number.isInteger(item.heading)) datoms.push([id, ':block/heading', item.heading]);
      const references = new Set([
        ...extractLinks(item.text).map(title => pagesByTitle.get(fold(title))),
        ...extractRefs(item.text).map(uid => ids.get(uid)),
      ].filter(value => value !== undefined));
      for (const ref of references) datoms.push([id, ':block/refs', ref]);
    }
  }
  return engine.init_db(datoms, SCHEMA);
}

function cleanResult(value) {
  // q returns ordinary JS values, including maps from pull. Copying also stops UI
  // callers from accidentally mutating a cached result. Unsupported numeric values
  // are represented as strings instead of silently becoming null during JSON export.
  return JSON.parse(JSON.stringify(value, (_, item) => typeof item === 'number' && !Number.isFinite(item) ? String(item) : typeof item === 'bigint' ? item.toString() : item));
}

/** Execute raw DataScript EDN against the current graph. The data is never mutated.
 * Result contains the engine's original shape plus table rows for the UI.
 * No custom JavaScript functions, Roam APIs, or external input bindings are supplied.
 */
export function runDatalog(data, queryText) {
  const engine = globalThis.datascript;
  if (!engine?.q || !engine?.init_db) throw new Error('O motor Datalog local não foi carregado. Reabra o Trama.');
  if (typeof queryText !== 'string' || !queryText.trim() || queryText.length > 20000) throw new Error('A consulta Datalog precisa ter entre 1 e 20.000 caracteres.');
  const query = queryText.trim();
  if (!query.startsWith('[') && !query.startsWith('{')) throw new Error('Use uma consulta Datalog EDN, como [:find ?title :where [?p :node/title ?title]].');
  rejectHostFunctions(query);
  let snapshot;
  try { snapshot = JSON.stringify(data); } catch { throw new Error('Grafo inválido ou circular.'); }
  if (snapshot !== cachedSnapshot || engine !== cachedEngine) {
    cachedDB = modelDB(data, engine); cachedSnapshot = snapshot; cachedEngine = engine; cachedQueries.clear();
  }
  if (cachedQueries.has(query)) return cleanResult(cachedQueries.get(query));
  let result;
  try {
    const bridged = bridgeAttributes(query);
    try { result = cleanResult(engine.q(bridged, cachedDB)); }
    catch (error) {
      // A query made only of expressions has no inferred $ source.
      if (/Extra inputs passed, expected: \[\], got: 1/u.test(error?.message || '')) result = cleanResult(engine.q(bridged));
      else throw error;
    }
  }
  catch (error) { throw new Error(`Consulta Datalog inválida: ${error?.message || String(error)}`); }
  // Normal relation: [[a,b],...]. Collection: [a,b,...]. Scalar/map: one cell.
  // A tuple find ([:find [?a ?b] ...]) is one row instead of a collection.
  const find = query.match(/:find\s+\[([^\]]*)\]/u);
  const tuple = query.startsWith('[') && find && !find[1].includes('...');
  const rows = result === null ? [] : Array.isArray(result)
    ? tuple ? [result] : result.map(row => Array.isArray(row) ? row : [row])
    : [[result]];
  const response = { rows, result };
  if (cachedQueries.size >= 64) cachedQueries.delete(cachedQueries.keys().next().value);
  cachedQueries.set(query, response);
  return cleanResult(response);
}
