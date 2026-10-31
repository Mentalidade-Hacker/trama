import { protectedRanges } from './proofread.js';
import * as C from './core.js';

const MAX_SPAN = 1000;
const VOCABULARY_PAGE = 'Vocabulário · Português e English';
const clone = value => JSON.parse(JSON.stringify(value));
const isSpace = char => /\s/u.test(char || '');

function snapshotOf(page) {
  try { return JSON.stringify(page); } catch { throw new Error('A página contém uma estrutura inválida ou circular.'); }
}

function allBlocks(page) {
  const blocks = [], pending = page.blocks.map(block => ({ block, depth: 0 })).reverse(), ids = new Set([page.id]);
  while (pending.length) {
    const { block, depth } = pending.pop();
    if (!block || typeof block.id !== 'string' || typeof block.text !== 'string' || !Array.isArray(block.children) || ids.has(block.id) || depth > 100) throw new Error('Estrutura de blocos inválida para tradução.');
    ids.add(block.id); blocks.push(block);
    for (let index = block.children.length - 1; index >= 0; index--) pending.push({ block: block.children[index], depth: depth + 1 });
  }
  return blocks;
}

function rangesFor(text) {
  const ranges = protectedRanges(text).map(range => [...range]);
  for (const match of text.matchAll(/\*\*|__|~~|\^\^|\r\n|\r|\n/g)) ranges.push([match.index, match.index + match[0].length]);
  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push(range);
  }
  return merged;
}

function translatableLinks(text) {
  const protectedSpans = protectedRanges(text);
  const pattern = /#?\[\[([^\[\]\r\n]+)\]\]|(?<![\p{L}\p{N}_/])#([\p{L}\p{N}_][\p{L}\p{N}_/-]*)/gu;
  return [...text.matchAll(pattern)].flatMap(match => {
    const start = match.index, end = start + match[0].length;
    const target = (match[1] ?? match[2]).trim();
    // An enclosing code/macro/attribute/destination range is larger than the link.
    // Adjacent protected syntax can be merged by protectedRanges: leave it alone.
    if (!target || !protectedSpans.some(([left, right]) => left === start && right === end) || text.slice(end, end + 2) === '::') return [];
    return [{ start, end, token: match[0], target }];
  });
}

function addSpans(prepared, text, field, blockId) {
  const ranges = rangesFor(text);
  function addRange(from, to) {
    let start = from;
    while (start < to) {
      while (start < to && isSpace(text[start])) start++;
      if (start >= to) break;
      let end = Math.min(start + MAX_SPAN, to);
      // Do not bisect a surrogate pair when splitting long prose.
      if (end < to && /[\uDC00-\uDFFF]/u.test(text[end]) && /[\uD800-\uDBFF]/u.test(text[end - 1])) end--;
      if (end < to) {
        const candidate = text.slice(start, end);
        const sentences = [...candidate.matchAll(/[.!?…][ \t]+/gu)];
        const sentence = sentences.at(-1);
        if (sentence && sentence.index > MAX_SPAN / 3) end = start + sentence.index + 1;
        else {
          const spaces = [...candidate.matchAll(/[ \t]+/gu)], boundary = spaces.at(-1);
          if (boundary && boundary.index > 0) end = start + boundary.index;
        }
      }
      while (end > start && isSpace(text[end - 1])) end--;
      if (end <= start) throw new Error('Não foi possível separar o texto da página.');
      const content = text.slice(start, end);
      // Punctuation surrounding protected links is layout, not a translation unit.
      if (/[\p{L}\p{N}]/u.test(content)) {
        prepared.segments.push({ field, ...(blockId ? { blockId } : {}), start, end });
        prepared.texts.push(content);
      }
      start = end;
    }
  }
  let start = 0;
  for (const [left, right] of ranges) { addRange(start, left); start = right; }
  addRange(start, text.length);
}

/** Prepare prose segments only. Every text is <=1000 UTF-16 code units. */
export function prepareTranslation(page) {
  if (!page || typeof page.id !== 'string' || typeof page.title !== 'string' || !Array.isArray(page.blocks)) throw new Error('Escolha uma página válida para traduzir.');
  const snapshot = snapshotOf(page), copy = clone(page);
  const prepared = { texts: [], segments: [], snapshot, pageId: page.id, page: copy };
  addSpans(prepared, copy.title, 'title');
  for (const block of allBlocks(copy)) {
    addSpans(prepared, block.text, 'block', block.id);
    for (const link of translatableLinks(block.text)) {
      if (link.target.length > MAX_SPAN) continue;
      prepared.segments.push({ field: 'block', blockId: block.id, kind: 'link-label', ...link });
      prepared.texts.push(link.target);
    }
  }
  return prepared;
}

function validatedOutput(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('A tradução precisa conter um texto não vazio para cada trecho.');
  const text = value.trim();
  if (/\[\[|\]\]|\(\(|\)\)|\{\{|\}\}|`|\$\$|\*\*|__|~~|\^\^|::|<[^>]*>|\[[^\]]*\]\s*\(|^[ \t]*#{1,6}[ \t]|^[ \t]*---[ \t]*$/mu.test(text) || C.extractLinks(text).length || C.extractRefs(text).length) {
    throw new Error('A tradução introduziu marcação de notas. O trecho foi recusado para preservar seus links e referências.');
  }
  if (/[\r\n]/u.test(text)) throw new Error('A tradução introduziu novas quebras de linha. Revise esse trecho antes de salvar.');
  return text;
}

/** Validate an automatic standalone translation before it becomes note content. */
export function validateTranslationText(text) {
  return validatedOutput(text);
}

function checkSnapshot(prepared, page) {
  if (!page || page.id !== prepared.pageId || snapshotOf(page) !== prepared.snapshot) throw new Error('A página mudou depois que a tradução começou. Traduza novamente antes de salvar a cópia.');
}

function syntaxSignature(text) {
  const counts = {}, pairs = new Set(['[[', ']]', '((', '))', '{{', '}}', '$$', '**', '__', '~~', '^^', '::']);
  // Count overlapping markers too: adding '*' beside '**' must not silently
  // change the interpretation of a delimiter that the translator never saw.
  for (let index = 0; index < text.length - 1; index++) {
    const pair = text.slice(index, index + 2);
    if (pairs.has(pair)) counts[pair] = (counts[pair] || 0) + 1;
  }
  return JSON.stringify({
    links: C.extractLinks(text).map(title => title.normalize('NFC').toLocaleLowerCase('pt-BR')).sort(),
    refs: C.extractRefs(text).sort(), markers: Object.entries(counts).sort(),
  });
}

/** Restore translated prose into an independent clone, preserving IDs and metadata. */
export function restoreTranslation(prepared, translatedTexts, currentPage) {
  if (!prepared || !Array.isArray(prepared.texts) || !Array.isArray(prepared.segments) || typeof prepared.snapshot !== 'string') throw new Error('Preparação de tradução inválida.');
  if (!Array.isArray(translatedTexts) || translatedTexts.length !== prepared.texts.length || prepared.segments.length !== prepared.texts.length) throw new Error('A quantidade de traduções não corresponde aos trechos da página.');
  if (currentPage !== undefined) checkSnapshot(prepared, currentPage);
  const page = JSON.parse(prepared.snapshot), blocks = new Map(allBlocks(page).map(block => [block.id, block]));
  if (page.id !== prepared.pageId) throw new Error('A página de origem da tradução está inválida.');
  const replacements = new Map(), protectedByField = new Map(), linksByField = new Map();
  prepared.segments.forEach((segment, index) => {
    const text = segment.field === 'title' ? page.title : blocks.get(segment.blockId)?.text;
    const key = segment.field === 'title' ? 'title:' : `block:${segment.blockId}`;
    if (!['title','block'].includes(segment.field) || typeof text !== 'string' || !Number.isInteger(segment.start) || !Number.isInteger(segment.end) || segment.start < 0 || segment.end <= segment.start) throw new Error('O mapeamento dos trechos da tradução está inválido.');
    let replacement = validatedOutput(translatedTexts[index]), baseline = null;
    if (segment.kind === 'link-label') {
      if (!linksByField.has(key)) linksByField.set(key, translatableLinks(text));
      const link = linksByField.get(key).find(candidate => candidate.start === segment.start && candidate.end === segment.end && candidate.target === segment.target && candidate.token === segment.token);
      if (segment.field !== 'block' || !link || prepared.texts[index] !== link.target || /[\[\]]/u.test(replacement)) throw new Error('O rótulo traduzido do link está inválido.');
      baseline = replacement === link.target ? link.token : `[${link.target}]([[${link.target}]])`;
      replacement = replacement === link.target ? link.token : `[${replacement}]([[${link.target}]])`;
    } else {
      if (text.slice(segment.start, segment.end) !== prepared.texts[index]) throw new Error('O mapeamento dos trechos da tradução está inválido.');
      if (!protectedByField.has(key)) protectedByField.set(key, rangesFor(text));
      if (protectedByField.get(key).some(([left, right]) => segment.start < right && segment.end > left)) throw new Error('O mapeamento dos trechos da tradução está inválido.');
    }
    if (!replacements.has(key)) replacements.set(key, []);
    replacements.get(key).push({ ...segment, value: replacement, baseline });
  });
  for (const [key, changes] of replacements) {
    const titleField = key === 'title:', block = titleField ? null : blocks.get(key.slice(6));
    let text = titleField ? page.title : block.text;
    const original = text; let baseline = original;
    const ordered = changes.sort((a, b) => b.start - a.start);
    let previous = text.length;
    for (const change of ordered) {
      if (change.end > previous) throw new Error('Os trechos da tradução se sobrepõem.');
      text = text.slice(0, change.start) + change.value + text.slice(change.end);
      if (change.baseline) baseline = baseline.slice(0, change.start) + change.baseline + baseline.slice(change.end);
      previous = change.start;
    }
    if (!titleField && syntaxSignature(baseline) !== syntaxSignature(text)) throw new Error('A tradução formaria nova marcação na junção dos trechos. A cópia não foi salva.');
    if (titleField) page.title = text; else block.text = text;
  }
  // Validate the translated title without mutating the source graph.
  C.newPage(page.title);
  return page;
}

/** Save as a distinct page only if the exact original snapshot is still current. */
export function saveTranslatedCopy(data, prepared, translatedTexts, { language, title } = {}) {
  const source = data.pages.find(page => page.id === prepared?.pageId);
  checkSnapshot(prepared, source);
  const copy = restoreTranslation(prepared, translatedTexts, source);
  const label = typeof language === 'string' && language.toLowerCase().startsWith('en') ? 'English' : typeof language === 'string' && language.toLowerCase().startsWith('pt') ? 'Português' : 'Tradução';
  const requested = title?.trim() || `${copy.title} · ${label}`;
  let base = requested.slice(0, 490).trim(), unique = base, index = 2;
  C.newPage(base);
  while (C.findPage(data, unique)) unique = `${base} (${index++})`;
  copy.id = C.uid(); copy.title = unique; copy.created = copy.updated = new Date().toISOString();
  const ids = new Map(), blocks = allBlocks(copy);
  for (const block of blocks) { const next = C.uid(); ids.set(block.id, next); block.id = next; }
  for (const block of blocks) block.text = block.text.replace(/\(\(([A-Za-z0-9_-]+)\)\)/g, (whole, id) => ids.has(id) ? `((${ids.get(id)}))` : whole);
  C.importData({ version: 1, pages: [copy] });
  data.pages.push(copy);
  return copy;
}

/** Create an ordinary editable learning card, with self-assessment rather than a score. */
export function addVocabularyCard(data, { original, translation, sourcePageId, sourceBlockId, sourceTitle, sourceLanguage, targetLanguage } = {}) {
  if (typeof original !== 'string' || !original.trim() || typeof translation !== 'string' || !translation.trim()) throw new Error('Informe o texto original e a tradução para criar o cartão.');
  const sourceBlock = sourceBlockId ? C.findBlock(data, sourceBlockId) : null;
  const sourcePage = sourcePageId ? data.pages.find(page => page.id === sourcePageId) : sourceBlock?.page;
  if (sourceBlockId && !sourceBlock) throw new Error('O bloco original não foi encontrado.');
  if (sourcePageId && !sourcePage) throw new Error('A página original não foi encontrada.');
  if (sourcePage && sourceBlock && sourceBlock.page.id !== sourcePage.id) throw new Error('O bloco não pertence à página de origem informada.');
  const linkedTitle = sourcePage?.title || sourceTitle;
  if (linkedTitle) C.newPage(linkedTitle);
  const languageName = value => typeof value === 'string' && value.toLowerCase().startsWith('en') ? 'English' : typeof value === 'string' && value.toLowerCase().startsWith('pt') ? 'Português' : 'texto';
  const card = C.newBlock('Cartão de vocabulário #trama/vocabulario #trama/pratica');
  card.children = [
    C.newBlock(`Original (${languageName(sourceLanguage)}): ${original.trim()}`),
    C.newBlock(`Tradução (${languageName(targetLanguage)}): ${translation.trim()}`),
  ];
  if (linkedTitle || sourceBlock) card.children.push(C.newBlock(`Origem: ${linkedTitle ? `[[${linkedTitle}]]` : ''}${sourceBlock ? ` ((${sourceBlock.block.id}))` : ''}`));
  card.children.push(C.newBlock('Prática: tente traduzir o original, depois compare com a tradução. Faça sua própria avaliação.'));
  const page = C.ensurePage(data, VOCABULARY_PAGE);
  if (page.blocks.length === 1 && !page.blocks[0].text && !page.blocks[0].children.length) page.blocks = [card]; else page.blocks.push(card);
  page.updated = new Date().toISOString();
  return { page, block: card };
}
