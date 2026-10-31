/** A bounded parser for the supported Roam query clauses. Never evaluates code. */
const fold = text => text.normalize('NFC').toLocaleLowerCase('pt-BR');
const queryStart = /\{\{\s*(?:\[\[query\]\]|query)\s*:/giu;

export function extractQueries(text) {
  const found = [];
  for (const match of text.matchAll(queryStart)) {
    if (found.some(item => match.index < item.end)) continue;
    let cursor = match.index + match[0].length, depth = 2, quote = false, escaped = false;
    const start = cursor;
    for (; cursor < text.length && depth; cursor++) {
      const char = text[cursor];
      if (escaped) { escaped = false; continue; }
      if (quote && char === '\\') { escaped = true; continue; }
      if (char === '"') { quote = !quote; continue; }
      if (quote) continue;
      if (text.startsWith('[[', cursor)) {
        const end = text.indexOf(']]', cursor + 2);
        if (end >= 0) { cursor = end + 1; continue; }
      }
      if (char === '{') depth++;
      if (char === '}') depth--;
    }
    found.push({ start: match.index, end: cursor, body: text.slice(start, depth ? cursor : cursor - 2).trim(), complete: depth === 0 });
  }
  return found;
}

export function parseQuery(input) {
  if (typeof input !== 'string' || input.length > 100000) throw new Error('Consulta inválida ou longa demais.');
  let source = input.trim(), named = false;
  if (/^\{\{\s*(?:\[\[query\]\]|query)\s*:/iu.test(source)) {
    const [query] = extractQueries(source);
    if (!query?.complete || query.end !== source.length) throw new Error('Consulta com chaves incompletas ou texto depois do fechamento.');
    source = query.body;
    named = true;
  }
  let pos = 0, count = 0;
  const fail = message => { throw new Error(`${message} (posição ${pos + 1}).`); };
  const space = () => { while (/\s/u.test(source[pos] ?? '') && pos < source.length) pos++; };
  function quoted() {
    const start = pos++;
    let escaped = false;
    while (pos < source.length) {
      const char = source[pos++];
      if (escaped) { escaped = false; continue; }
      if (char === '\\') { escaped = true; continue; }
      if (char === '"') {
        try { return JSON.parse(source.slice(start, pos)); } catch { fail('Texto entre aspas inválido'); }
      }
    }
    fail('Aspas não fechadas');
  }
  function bracket() {
    pos += 2;
    const end = source.indexOf(']]', pos);
    if (end < 0) fail('Link de página não fechado');
    const value = source.slice(pos, end).trim();
    if (!value || value.includes('[[')) fail('Título de página inválido');
    pos = end + 2;
    return value;
  }
  function many(depth, inside = false) {
    const nodes = [];
    while (true) {
      space();
      if (pos >= source.length) { if (inside) fail('Chave não fechada'); return nodes; }
      if (source[pos] === '}') { if (!inside) fail('Chave de fechamento inesperada'); pos++; return nodes; }
      nodes.push(primary(depth));
    }
  }
  function primary(depth) {
    if (depth > 32 || ++count > 1000) fail('Consulta complexa demais');
    space();
    if (source[pos] === '{') {
      pos++; space();
      const op = source.slice(pos).match(/^([a-z-]+)\s*:/iu);
      if (!op) fail('Esperado operador seguido de :');
      pos += op[0].length;
      const type = op[1].toLowerCase();
      if (type === 'search') {
        space();
        let value;
        if (source[pos] === '"') { value = quoted(); space(); if (source[pos] !== '}') fail('search aceita apenas um texto'); }
        else { const end = source.indexOf('}', pos); if (end < 0) fail('Chave não fechada'); value = source.slice(pos, end).trim(); if (value.includes('{')) fail('search não aceita cláusulas internas'); pos = end; }
        pos++;
        if (!value) fail('search precisa de um texto');
        return { type: 'text', value };
      }
      if (!['and', 'or', 'not', 'between', 'daily-notes'].includes(type)) fail(`Operador não suportado: ${type}`);
      const children = many(depth + 1, true);
      if (type === 'daily-notes') { if (children.length) fail('daily-notes não aceita argumentos'); return { type }; }
      if (type === 'between') {
        if (children.length !== 2 || children.some(child => !['page', 'text'].includes(child.type))) fail('between precisa de duas datas [[AAAA-MM-DD]]');
        return { type, from: children[0].value, to: children[1].value };
      }
      if (!children.length) fail(`${type} precisa de condições`);
      if (type === 'not' && children.length !== 1) fail('not aceita uma condição; combine várias com or');
      return { type, children };
    }
    if (source.startsWith('[[', pos)) return { type: 'page', value: bracket() };
    if (source.startsWith('((', pos)) {
      const match = source.slice(pos).match(/^\(\(([A-Za-z0-9_-]+)\)\)/u);
      if (!match) fail('Referência de bloco inválida');
      pos += match[0].length; return { type: 'ref', value: match[1] };
    }
    if (source[pos] === '#') {
      pos++;
      if (source.startsWith('[[', pos)) return { type: 'page', value: bracket() };
      const match = source.slice(pos).match(/^[\p{L}\p{N}_][\p{L}\p{N}_/-]*/u);
      if (!match) fail('Tag inválida');
      pos += match[0].length; return { type: 'page', value: match[0] };
    }
    if (source.slice(pos).match(/^search\s*:/iu)) {
      pos += source.slice(pos).match(/^search\s*:/iu)[0].length; space();
      const quotedValue = source[pos] === '"';
      const value = quotedValue ? quoted() : source.slice(pos).match(/^[^\s{}]+/u)?.[0];
      if (!value) fail('search precisa de um texto');
      if (!quotedValue) pos += value.length;
      return { type: 'text', value };
    }
    if (source[pos] === '"') return { type: 'text', value: quoted() };
    const match = source.slice(pos).match(/^[^\s{}]+/u);
    if (!match) fail('Condição inválida');
    pos += match[0].length;
    return { type: 'text', value: match[0] };
  }
  let title = null;
  if (named && source.startsWith('"')) {
    const saved = pos, candidate = quoted(); space();
    if (source[pos] === '{') title = candidate; else pos = saved;
  }
  const children = many(0);
  return { type: 'and', children, title };
}

function iso(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
export function queryDate(value, currentDate = new Date()) {
  const text = fold(value.trim()), date = new Date(typeof currentDate === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(currentDate) ? currentDate + 'T12:00:00' : currentDate);
  if (['today', 'yesterday', 'tomorrow', 'last week', 'next week', 'last month', 'next month'].includes(text)) {
    if (!Number.isFinite(date.getTime())) throw new Error('Data de referência inválida para a consulta.');
    if (text === 'yesterday') date.setDate(date.getDate() - 1);
    if (text === 'tomorrow') date.setDate(date.getDate() + 1);
    if (text === 'last week') date.setDate(date.getDate() - 7);
    if (text === 'next week') date.setDate(date.getDate() + 7);
    if (text === 'last month' || text === 'next month') {
      const day = date.getDate(); date.setDate(1);
      date.setMonth(date.getMonth() + (text === 'last month' ? -1 : 1));
      const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      date.setDate(Math.min(day, lastDay));
    }
    return iso(date);
  }
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/u);
  let year, month, day;
  if (match) [, year, month, day] = match.map(Number);
  else {
    match = text.match(/^(january|february|march|april|may|june|july|august|september|october|november|december) (\d{1,2})(?:st|nd|rd|th)?, (\d{4})$/u);
    if (!match) return null;
    year = Number(match[3]); month = ['january','february','march','april','may','june','july','august','september','october','november','december'].indexOf(match[1]) + 1; day = Number(match[2]);
  }
  const checked = new Date(year, month - 1, day, 12);
  return checked.getFullYear() === year && checked.getMonth() === month - 1 && checked.getDate() === day ? iso(checked) : null;
}

export function evaluateQuery(entries, query, { extractLinks, extractRefs, currentDate = new Date() }) {
  const ast = typeof query === 'string' ? parseQuery(query) : query;
  if (!ast.children?.length) return [];
  const byId = new Map(entries.map(entry => [entry.block.id, entry]));
  const inherited = new Map();
  function context(entry) {
    if (inherited.has(entry.block.id)) return inherited.get(entry.block.id);
    const pages = new Set([fold(entry.page.title)]), refs = new Set(), seen = new Set();
    let cursor = entry;
    while (cursor) {
      if (seen.has(cursor.block.id)) throw new Error('Hierarquia circular de blocos encontrada.');
      seen.add(cursor.block.id);
      for (const link of extractLinks(cursor.block.text)) pages.add(fold(link));
      for (const ref of extractRefs(cursor.block.text)) refs.add(ref);
      cursor = cursor.parent ? byId.get(cursor.parent.id) : null;
    }
    const result = { pages, refs, dates: [...pages].map(title => queryDate(title, currentDate)).filter(Boolean) };
    inherited.set(entry.block.id, result);
    return result;
  }
  const preparing = new Set();
  function prepare(node, depth = 0) {
    if (!node || typeof node !== 'object' || preparing.has(node) || depth > 32) throw new Error('Estrutura de consulta inválida ou circular.');
    preparing.add(node);
    if (node.type === 'between') {
      const from = queryDate(node.from, currentDate), to = queryDate(node.to, currentDate);
      if (!from || !to) throw new Error('between contém uma data inválida; use [[AAAA-MM-DD]] ou [[today]].');
      preparing.delete(node);
      return { ...node, from: from < to ? from : to, to: from < to ? to : from };
    }
    const result = node.children ? { ...node, children: node.children.map(child => prepare(child, depth + 1)) } : node;
    preparing.delete(node);
    return result;
  }
  const prepared = prepare(ast);
  function matches(node, entry, ctx) {
    switch (node.type) {
      case 'and': return node.children.every(child => matches(child, entry, ctx));
      case 'or': return node.children.some(child => matches(child, entry, ctx));
      case 'not': return !matches(node.children[0], entry, ctx);
      case 'page': return ctx.pages.has(fold(node.value));
      case 'ref': return ctx.refs.has(node.value);
      case 'text': return fold(entry.block.text).includes(fold(node.value));
      case 'daily-notes': return ctx.dates.length > 0;
      case 'between': return ctx.dates.some(date => date >= node.from && date <= node.to);
      default: throw new Error(`Condição não suportada: ${node.type}`);
    }
  }
  return entries.filter(entry => !/\{\{\s*(?:\[\[query\]\]|query)\s*:/iu.test(entry.block.text) && matches(prepared, entry, context(entry)));
}
