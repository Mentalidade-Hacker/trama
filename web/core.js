/** Trama's portable graph model. All mutators update the supplied data in place. */
import { evaluateQuery } from './query.js';
const fold = value => value.normalize('NFC').toLocaleLowerCase('pt-BR');
const linkPattern = () => /#?\[\[([^\]\r\n]+)\]\]|(?<![\p{L}\p{N}_/])#([\p{L}\p{N}_][\p{L}\p{N}_/-]*)/gu;
const sameTitle = (a, b) => fold(a.trim()) === fold(b.trim());
const now = () => new Date().toISOString();
const attributePattern = () => /^([ \t]*)(\[\[[^\]\r\n]+\]\]|[^:\r\n]+?)::([ \t]*)(.*)$/gmu;

/** Literal syntax must not create graph connections or be rewritten on rename. */
function literalSpans(text) {
  const tokens = /```[\s\S]*?(?:```|$)|`[^`]+`|\$\$[\s\S]*?\$\$|\[([^\]\r\n]+)\]\((\[\[[^\]\r\n]+\]\]|\(\([A-Za-z0-9_-]+\)\))\)|!?\[[^\]\r\n]*\]\((?!\[\[|\(\()[^\s)]+\)|#?\[\[[^\]\r\n]+\]\]|\(\([A-Za-z0-9_-]+\)\)|https?:\/\/[^\s<>"']+/giu;
  const spans = [];
  for (const match of text.matchAll(tokens)) {
    if (match[1] !== undefined) {
      // An alias label is plain text; only its page/block destination is active.
      spans.push([match.index, match.index + match[1].length + 3]);
    } else if (!/^#?\[\[|^\(\(/u.test(match[0])) {
      spans.push([match.index, match.index + match[0].length]);
    }
  }
  return spans;
}

function outsideLiteral(spans, index, length) {
  let low = 0, high = spans.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (spans[middle][1] <= index) low = middle + 1;
    else high = middle;
  }
  return low === spans.length || index + length <= spans[low][0];
}

function activeMatches(text, pattern) {
  const spans = literalSpans(text);
  return [...text.matchAll(pattern)].filter(match => outsideLiteral(spans, match.index, match[0].length));
}

/** Rewrite real references while leaving examples, URLs and formula text intact. */
function replaceActive(text, pattern, replacer) {
  const spans = literalSpans(text);
  return text.replace(pattern, (...args) => {
    const offset = args[args.length - 2];
    return outsideLiteral(spans, offset, args[0].length) ? replacer(...args) : args[0];
  });
}

export function attributesOf(text) {
  const spans = literalSpans(text);
  return [...text.matchAll(attributePattern())].filter(match => outsideLiteral(spans, match.index, match[1].length + match[2].length + 2)).map(match => ({
    name: match[2].trim().replace(/^\[\[|\]\]$/g, ''), value: match[4].trim(),
  })).filter(attribute => attribute.name && !/[`{}#]/u.test(attribute.name));
}

export function uid() {
  return globalThis.crypto?.randomUUID?.() ?? `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function titleValue(title) {
  if (typeof title !== 'string' || !title.trim() || title.length > 500 || /[\r\n]|\[\[|\]\]/u.test(title)) {
    throw new Error('O título precisa ter entre 1 e 500 caracteres, sem quebras de linha ou colchetes duplos.');
  }
  return title.trim();
}

export function newBlock(text = '') {
  return { id: uid(), text, children: [], collapsed: false };
}

export function newPage(title) {
  const date = now();
  return { id: uid(), title: titleValue(title), created: date, updated: date, blocks: [newBlock()] };
}

export function walkBlocks(pages) {
  const entries = [];
  function visit(siblings, page, parent, depth) {
    siblings.forEach((block, index) => {
      entries.push({ block, page, parent, siblings, index, depth });
      visit(block.children, page, block, depth + 1);
    });
  }
  for (const page of pages) visit(page.blocks, page, null, 0);
  return entries;
}

export function extractLinks(text) {
  const titles = new Map();
  for (const match of activeMatches(text, linkPattern())) {
    const title = (match[1] ?? match[2]).trim();
    if (title&&!title.includes('[[')) titles.set(fold(title), titles.get(fold(title)) ?? title);
  }
  for (const attribute of attributesOf(text)) titles.set(fold(attribute.name), titles.get(fold(attribute.name)) ?? attribute.name);
  return [...titles.values()];
}

export function extractRefs(text) {
  return [...new Set(activeMatches(text, /#?\[\[[^\]\r\n]+\]\]|\(\(([A-Za-z0-9_-]+)\)\)/g).filter(match=>match[1]).map(match => match[1]))];
}

export function rewriteBlockReferences(text, transform) {
  return replaceActive(text, /#?\[\[[^\]\r\n]+\]\]|\(\(([A-Za-z0-9_-]+)\)\)/g, (whole, id) => id?transform(id, whole):whole);
}

export function findPage(data, title) {
  return data.pages.find(page => sameTitle(page.title, title));
}

export function findBlock(data, id) {
  return walkBlocks(data.pages).find(entry => entry.block.id === id);
}

export function ensurePage(data, title) {
  const cleanTitle = titleValue(title);
  let page = findPage(data, cleanTitle);
  if (!page) {
    page = newPage(cleanTitle);
    data.pages.push(page);
  }
  return page;
}

export function backlinks(data, title) {
  return walkBlocks(data.pages).filter(({ block }) => extractLinks(block.text).some(link => sameTitle(link, title)));
}

/** Return a raw-text offset suitable for inserting [[...]], outside existing markup. */
export function unlinkedMentionIndex(text, title) {
  const clean = title.trim();
  if (!clean) return -1;
  const protectedPattern = /\[[^\]\r\n]+\]\(https?:\/\/[^\s)]+\)|`[^`]*`|https?:\/\/\S+|#?\[\[([^\]\r\n]+)\]\]|(?<![\p{L}\p{N}_/])#([\p{L}\p{N}_][\p{L}\p{N}_/-]*)|\(\([A-Za-z0-9_-]+\)\)/gu;
  const protectedSpans = [...literalSpans(text), ...[...text.matchAll(protectedPattern)].map(match => [match.index, match.index + match[0].length])];
  const literal = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const wordStart = /^[\p{L}\p{N}_]/u.test(clean);
  const wordEnd = /[\p{L}\p{N}_]$/u.test(clean);
  for (const match of text.matchAll(new RegExp(literal, 'giu'))) {
    const start = match.index, end = start + match[0].length;
    if (protectedSpans.some(([left, right]) => start < right && end > left)) continue;
    if (wordStart && /[\p{L}\p{N}_]$/u.test(text.slice(0, start))) continue;
    if (wordEnd && /^[\p{L}\p{N}_]/u.test(text.slice(end))) continue;
    return start;
  }
  return -1;
}

export function unlinkedReferences(data, title) {
  if (!title.trim()) return [];
  return walkBlocks(data.pages).filter(({ block, page }) => !sameTitle(page.title, title)
    && unlinkedMentionIndex(block.text, title) >= 0
    && !extractLinks(block.text).some(link => sameTitle(link, title)));
}

export function graphData(data) {
  const nodes = data.pages.map(({ id, title }) => ({ id, title }));
  const byTitle = new Map(data.pages.map(page => [fold(page.title), page]));
  const entries = walkBlocks(data.pages);
  const blockPages = new Map(entries.map(({ block, page }) => [block.id, page]));
  const seen = new Set();
  const edges = [];
  for (const { page, block } of entries) {
    for (const title of extractLinks(block.text)) {
      const target = byTitle.get(fold(title));
      if (!target) continue;
      const key = `${page.id}:${target.id}`;
      if (!seen.has(key)) {
        seen.add(key);
        edges.push({ source: page.id, target: target.id });
      }
    }
    for (const ref of extractRefs(block.text)) {
      const target = blockPages.get(ref);
      if (!target || target.id === page.id) continue;
      const key = `${page.id}:${target.id}`;
      if (!seen.has(key)) {
        seen.add(key);
        edges.push({ source: page.id, target: target.id });
      }
    }
  }
  return { nodes, edges };
}

export function renamePage(data, id, newTitle) {
  const page = data.pages.find(item => item.id === id);
  if (!page) throw new Error('Página não encontrada.');
  const cleanTitle = titleValue(newTitle);
  const existing = findPage(data, cleanTitle);
  if (existing && existing.id !== id) throw new Error('Já existe uma página com esse título.');
  const oldTitle = page.title;
  for (const entry of walkBlocks(data.pages)) {
    let updated = replaceActive(entry.block.text, linkPattern(), (whole, bracket, tag) => {
      if (!sameTitle(bracket ?? tag, oldTitle)) return whole;
      if (bracket !== undefined) return `${whole.startsWith('#') ? '#' : ''}[[${cleanTitle}]]`;
      return /^[\p{L}\p{N}_][\p{L}\p{N}_/-]*$/u.test(cleanTitle) ? `#${cleanTitle}` : `#[[${cleanTitle}]]`;
    });
    const spans = literalSpans(updated);
    updated = updated.replace(attributePattern(), (whole, indent, name, spacing, value, offset) => {
      if (!outsideLiteral(spans, offset, indent.length + name.length + 2)) return whole;
      const plain = name.trim().replace(/^\[\[|\]\]$/g, '');
      if (!sameTitle(plain, oldTitle)) return whole;
      const replacement = name.trim().startsWith('[[') || cleanTitle.includes(':') ? `[[${cleanTitle}]]` : cleanTitle;
      return `${indent}${replacement}::${spacing}${value}`;
    });
    if (updated !== entry.block.text) {
      entry.block.text = updated;
      entry.page.updated = now();
    }
  }
  page.title = cleanTitle;
  page.updated = now();
  return page;
}

export function indentBlock(data, id) {
  const entry = findBlock(data, id);
  if (!entry || entry.index === 0) return false;
  const pending = [[entry.block, entry.depth + 1]];
  while (pending.length) {
    const [block, depth] = pending.pop();
    if (depth >= 100) return false;
    for (const child of block.children) pending.push([child, depth + 1]);
  }
  const parent = entry.siblings[entry.index - 1];
  entry.siblings.splice(entry.index, 1);
  parent.children.push(entry.block);
  parent.collapsed = false;
  entry.page.updated = now();
  return true;
}

export function outdentBlock(data, id) {
  const entry = findBlock(data, id);
  if (!entry?.parent) return false;
  const parentEntry = findBlock(data, entry.parent.id);
  entry.siblings.splice(entry.index, 1);
  parentEntry.siblings.splice(parentEntry.index + 1, 0, entry.block);
  entry.page.updated = now();
  return true;
}

export function moveBlock(data, id, direction) {
  const entry = findBlock(data, id);
  if (!entry || ![-1, 1].includes(direction)) return false;
  const index = entry.index + direction;
  if (index < 0 || index >= entry.siblings.length) return false;
  [entry.siblings[entry.index], entry.siblings[index]] = [entry.siblings[index], entry.siblings[entry.index]];
  entry.page.updated = now();
  return true;
}

export function removeBlock(data, id) {
  const entry = findBlock(data, id);
  if (!entry) return false;
  entry.siblings.splice(entry.index, 1);
  if (!entry.page.blocks.length) entry.page.blocks.push(newBlock());
  entry.page.updated = now();
  return true;
}

/** Read a Trama snapshot or Roam JSON export. A new graph is returned; input is never modified. */
export function importData(raw) {
  const input = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const roam = Array.isArray(input);
  const source = roam ? input : input?.pages;
  if (!Array.isArray(source) || (!roam && input.version !== 1)) throw new Error('Formato desconhecido. Use um JSON do Trama (versão 1) ou do Roam.');
  if (source.length > 50000) throw new Error('O arquivo excede o limite de 50.000 páginas.');
  const ids = new Set();
  const titles = new Set();
  let count = 0;
  function idValue(value) {
    const id = value === undefined && roam ? uid() : value;
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error('Identificador de página ou bloco inválido.');
    if (ids.has(id)) throw new Error(`Identificador duplicado: ${id}`);
    ids.add(id);
    return id;
  }
  function dateValue(value) {
    if (value === undefined && roam) return now();
    if ((typeof value !== 'number' && typeof value !== 'string') || !Number.isFinite(new Date(value).getTime())) throw new Error('Data inválida no arquivo.');
    return new Date(value).toISOString();
  }
  function blocksValue(value, depth) {
    if (value === undefined && roam) return [];
    if (!Array.isArray(value) || (depth >= 100 && value.length)) throw new Error('Estrutura de blocos inválida ou profunda demais (máximo: 100 níveis).');
    return value.map(block => {
      if (!block || typeof block !== 'object' || Array.isArray(block)) throw new Error('Bloco inválido.');
      if (++count > 200000) throw new Error('O arquivo excede o limite de 200.000 blocos.');
      const text = roam ? block.string : block.text;
      if (typeof text !== 'string' || text.length > 1000000) throw new Error('Texto de bloco inválido ou grande demais.');
      if (!roam && typeof block.collapsed !== 'boolean') throw new Error('Estado de bloco inválido.');
      const result = {
        id: idValue(roam ? block.uid : block.id),
        text,
        children: blocksValue(block.children, depth + 1),
        collapsed: roam ? block.open === false : block.collapsed,
      };
      const heading = block.heading;
      const alignment = roam ? (block['text-align'] ?? block.alignment) : block.alignment;
      const view = roam ? (block['children-view-type'] ?? block.view) : block.view;
      if (heading !== undefined) {
        if (!Number.isInteger(heading) || heading < 0 || heading > 3) throw new Error('Nível de título de bloco inválido.');
        result.heading = heading;
      }
      if (alignment !== undefined) {
        if (!['left','center','right'].includes(alignment)) throw new Error('Alinhamento de bloco inválido.');
        result.alignment = alignment;
      }
      if (view !== undefined) {
        if (!['bullet','numbered','document'].includes(view)) throw new Error('Visualização de bloco inválida.');
        result.view = view;
      }
      return result;
    });
  }
  return { version: 1, pages: source.map(page => {
    if (!page || typeof page !== 'object') throw new Error('Página inválida.');
    const title = titleValue(page.title);
    if (titles.has(fold(title))) throw new Error(`Título duplicado: ${title}`);
    titles.add(fold(title));
    const id = idValue(roam ? page.uid : page.id);
    const blocks = blocksValue(roam ? page.children : page.blocks, 0);
    if (!blocks.length) {
      const blank = newBlock();
      ids.add(blank.id);
      blocks.push(blank);
    }
    return {
      id, title,
      created: dateValue(roam ? page['create-time'] : page.created),
      updated: dateValue(roam ? page['edit-time'] : page.updated),
      blocks,
    };
  }) };
}

export function exportMarkdown(data) {
  function blockLines(blocks, depth = 0) {
    return blocks.flatMap(block => {
      const indent = '  '.repeat(depth), heading = block.heading || 0;
      const lines = block.text.replace(/\r\n?/g, '\n').split('\n');
      // Explicit boundaries distinguish children from literal lists and unfinished code.
      // Text remains in the visible outline once; the comment contains structure only.
      const metadata = JSON.stringify({ id: block.id, depth, lineCount: lines.length, heading });
      const visible = lines.map((line, index) => index === 0
        ? `${indent}- ${heading ? '#'.repeat(heading) + ' ' : ''}${line}`
        : `${indent}  ${line}`);
      visible[visible.length - 1] += ` ^${block.id}`;
      return [`${indent}<!-- trama-block-v2 ${metadata} -->`, ...visible, ...blockLines(block.children, depth + 1)];
    });
  }
  return '<!-- trama-export-v2 -->\n' + data.pages.map(page => `# ${page.title}\n\n${blockLines(page.blocks).join('\n')}\n`).join('\n---\n\n');
}

/** Simple AND searches and supported nested Roam clauses share the same evaluator. */
export function queryBlocks(data, query, options = {}) {
  return evaluateQuery(walkBlocks(data.pages), query, { extractLinks, extractRefs, ...options });
}

export function listTemplates(data) {
  return walkBlocks(data.pages).flatMap(entry => {
    const marker = activeMatches(entry.block.text, linkPattern()).find(match => sameTitle(match[1] ?? match[2], 'roam/templates'));
    return marker ? [{ ...entry, id: entry.block.id, label: entry.block.text.slice(0, marker.index).trim() || entry.page.title }] : [];
  });
}

function localDate(offset = 0, reference = new Date()) {
  const date = new Date(reference); date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function instantiateTemplate(data, templateId, targetId, referenceDate = new Date()) {
  const template = listTemplates(data).find(item => item.id === templateId), target = findBlock(data, targetId);
  if (!template || !target) throw new Error('Modelo ou bloco de destino não encontrado.');
  if (!template.block.children.length) throw new Error('Adicione blocos filhos ao modelo antes de inseri-lo.');
  const ids = new Map();
  function clone(block, depth) {
    if (depth >= 100) throw new Error('A inserção excederia 100 níveis de blocos.');
    const id = uid(); ids.set(block.id, id);
    return { ...block, id, children: block.children.map(child => clone(child, depth + 1)) };
  }
  const blocks = template.block.children.map(block => clone(block, target.depth + 1));
  function rewrite(block) {
    block.text = rewriteBlockReferences(block.text, (id,whole) => ids.has(id) ? `((${ids.get(id)}))` : whole)
      .replace(/<%(today|tomorrow|yesterday)%>/g, (_, word) => localDate(word === 'tomorrow' ? 1 : word === 'yesterday' ? -1 : 0, referenceDate));
    block.children.forEach(rewrite);
  }
  blocks.forEach(rewrite);
  target.block.children.push(...blocks); target.block.collapsed = false; target.page.updated = now();
  return blocks;
}

export function exportRoam(data) {
  function blockJSON(block) {
    const value = { uid: block.id, string: block.text, open: !block.collapsed, children: block.children.map(blockJSON) };
    if (block.heading !== undefined) value.heading = block.heading;
    if (block.alignment !== undefined) value['text-align'] = block.alignment;
    if (block.view !== undefined) value['children-view-type'] = block.view;
    return value;
  }
  return data.pages.map(page => ({ uid: page.id, title: page.title, 'create-time': new Date(page.created).getTime(), 'edit-time': new Date(page.updated).getTime(), children: page.blocks.map(blockJSON) }));
}

/** Merge validated imports without losing either graph. Colliding block IDs are remapped. */
export function mergeGraph(data, incoming) {
  const result = importData(data), addition = importData(incoming);
  const used = new Set([...result.pages.map(page => page.id), ...walkBlocks(result.pages).map(entry => entry.block.id)]);
  const mapping = new Map();
  for (const page of addition.pages) {
    const existing = findPage(result, page.title);
    if (existing) mapping.set(page.id, existing.id);
    else if (used.has(page.id)) mapping.set(page.id, uid());
    used.add(mapping.get(page.id) ?? page.id);
    for (const { block } of walkBlocks([page])) {
      if (used.has(block.id)) mapping.set(block.id, uid());
      used.add(mapping.get(block.id) ?? block.id);
    }
  }
  for (const page of addition.pages) {
    for (const { block } of walkBlocks([page])) {
      block.id = mapping.get(block.id) ?? block.id;
      block.text = rewriteBlockReferences(block.text, (id,whole) => mapping.has(id) ? `((${mapping.get(id)}))` : whole);
    }
    page.id = mapping.get(page.id) ?? page.id;
    const existing = findPage(result, page.title);
    if (existing) { existing.blocks.push(...page.blocks); existing.updated = now(); }
    else result.pages.push(page);
  }
  // Validate the combined limits before committing a single mutation.
  const checked = importData(result);
  data.pages = checked.pages;
  return data;
}
