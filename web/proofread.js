/** Offset-safe helpers for the optional local LanguageTool integration.
 * JavaScript and LanguageTool offsets count UTF-16 code units, not code points.
 */

function assertText(text) {
  if (typeof text !== 'string') throw new Error('O texto para revisão precisa ser uma string.');
}

function splitSurrogate(text, index) {
  if (index <= 0 || index >= text.length) return false;
  const left = text.charCodeAt(index - 1), right = text.charCodeAt(index);
  return left >= 0xD800 && left <= 0xDBFF && right >= 0xDC00 && right <= 0xDFFF;
}

function validRange(text, offset, length) {
  return Number.isSafeInteger(offset) && Number.isSafeInteger(length) && offset >= 0 && length >= 0
    && offset <= text.length && length <= text.length - offset
    && !splitSurrogate(text, offset) && !splitSurrogate(text, offset + length);
}

/** Half-open ranges [start,end] containing note syntax that must not be corrected. */
export function protectedRanges(text) {
  assertText(text);
  const ranges = [];
  const add = (start, end) => { if (end > start) ranges.push([start, end]); };

  // Nested page links/directives, including unfinished syntax while editing.
  for (const [open, close] of [['[[', ']]'], ['{{', '}}']]) {
    let from = 0;
    while (from < text.length) {
      const start = text.indexOf(open, from);
      if (start < 0) break;
      let cursor = start + open.length, depth = 1;
      while (depth && cursor < text.length) {
        const nextOpen = text.indexOf(open, cursor), nextClose = text.indexOf(close, cursor);
        if (nextClose < 0) { cursor = text.length; break; }
        if (nextOpen >= 0 && nextOpen < nextClose) { depth++; cursor = nextOpen + open.length; }
        else { depth--; cursor = nextClose + close.length; }
      }
      add(open === '[[' && text[start - 1] === '#' ? start - 1 : start, cursor);
      from = cursor;
    }
  }

  // Inline code and fenced code. Preserve all text until a matching backtick run.
  let cursor = 0;
  while (cursor < text.length) {
    const start = text.indexOf('`', cursor);
    if (start < 0) break;
    let length = 1;
    while (text[start + length] === '`') length++;
    const delimiter = '`'.repeat(length), end = text.indexOf(delimiter, start + length);
    if (end >= 0) cursor = end + length;
    else {
      const newline = length < 3 ? text.indexOf('\n', start + length) : -1;
      cursor = newline < 0 ? text.length : newline;
    }
    add(start, cursor);
  }

  for (const match of text.matchAll(/\(\([A-Za-z0-9_-]+\)\)|(?<![\p{L}\p{N}_/])#([\p{L}\p{N}_][\p{L}\p{N}_/-]*)|https?:\/\/[^\s<>"`]+/gu)) {
    add(match.index, match.index + match[0].length);
  }

  // Attribute names are page links; only their values are natural language.
  for (const match of text.matchAll(/^([ \t]*)(\[\[[^\[\]\r\n]+\]\]|[^:\r\n]+?)::[ \t]*/gmu)) {
    if (!/[`{}#]/u.test(match[2])) add(match.index, match.index + match[0].length);
  }
  for (const match of text.matchAll(/^[ \t]{0,3}#{1,6}[ \t]+|<%(?:today|tomorrow|yesterday)%>/gm)) {
    add(match.index, match.index + match[0].length);
  }
  // Formula source, including unfinished formulas, should never receive prose edits.
  let mathCursor = 0;
  while (mathCursor < text.length) {
    const start = text.indexOf('$$', mathCursor);
    if (start < 0) break;
    const end = text.indexOf('$$', start + 2);
    mathCursor = end < 0 ? text.length : end + 2;
    add(start, mathCursor);
  }

  // A Markdown label is natural language; only its delimiters/destination are protected.
  for (const match of text.matchAll(/!?\[([^\]\r\n]+)\]\(/g)) {
    const start = match.index, labelStart = start + (match[0].startsWith('!') ? 2 : 1);
    const destination = start + match[0].length - 2;
    let end = destination + 2, depth = 1;
    while (end < text.length && depth) {
      if (text[end] === '\\') { end = Math.min(end + 2, text.length); continue; }
      if (text[end] === '(') depth++;
      else if (text[end] === ')') depth--;
      end++;
    }
    add(start, labelStart);
    add(destination, end);
  }

  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  return merged;
}

/** Mask note syntax without changing UTF-16 positions or line breaks. */
export function maskMarkup(text) {
  const ranges = protectedRanges(text);
  let output = '', previous = 0;
  for (const [start, end] of ranges) {
    output += text.slice(previous, start) + text.slice(start, end).replace(/[^\r\n]/g, ' ');
    previous = end;
  }
  return output + text.slice(previous);
}

/** Invalid offsets count as protected so callers can safely filter untrusted matches. */
export function isProtectedRange(text, offset, length) {
  assertText(text);
  if (!validRange(text, offset, length)) return true;
  const end = offset + length;
  return protectedRanges(text).some(([left, right]) => length === 0
    ? offset > left && offset < right
    : offset < right && end > left);
}

/** Apply exactly one reviewed suggestion to the exact text that was checked. */
export function applySuggestion(text, match, replacement, expectedText) {
  assertText(text);
  if (typeof expectedText !== 'string' || text !== expectedText) {
    throw new Error('O bloco mudou depois da revisão. Revise o texto novamente antes de aplicar a sugestão.');
  }
  if (!match || !validRange(text, match.offset, match.length) || typeof replacement !== 'string') {
    throw new Error('A sugestão contém uma posição ou substituição inválida.');
  }
  if (isProtectedRange(text, match.offset, match.length)) {
    throw new Error('Esta sugestão alteraria um link, uma referência ou outro trecho protegido.');
  }
  return text.slice(0, match.offset) + replacement + text.slice(match.offset + match.length);
}
