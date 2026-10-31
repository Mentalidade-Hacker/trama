import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../web/core.js';
import { parseQuery, extractQueries, queryDate, evaluateQuery } from '../web/query.js';

function fixture() {
  const page = C.newPage('Project');
  const parent = C.newBlock('[[A]] ((target))');
  const b = C.newBlock('[[B]] Pricing options'), c = C.newBlock('[[C]] Other pricing'), d = C.newBlock('[[B]] [[D]] excluded');
  parent.children = [b, c, d]; page.blocks = [parent, C.newBlock('{{query: {and: [[A]] [[B]]}}}')];
  const day = C.newPage('2026-10-31'); day.blocks = [C.newBlock('Daily task [[A]]')];
  const outside = C.newPage('Notes'); outside.blocks = [C.newBlock('Date [[2026-01-12]]'), C.newBlock('No date')];
  return { data: { version: 1, pages: [page, day, outside] }, parent, b, c, d, day, outside };
}

test('nested and/or/not inherit page and ancestor links without including query definitions', () => {
  const { data, b, c } = fixture();
  assert.deepEqual(C.queryBlocks(data, '{{query: {and: [[A]] {or: [[B]] [[C]]} {not: [[D]]}}}}').map(e => e.block.id), [b.id, c.id]);
  assert.deepEqual(C.queryBlocks(data, '{and: [[Project]] ((target)) [[B]] {not: [[D]]}}').map(e => e.block.id), [b.id]);
  assert.deepEqual(C.queryBlocks(data, '[[A]] [[B]]').map(e => e.block.text), ['[[B]] Pricing options', '[[B]] [[D]] excluded']);
});

test('search supports quoted text, escaped quotes and clause form', () => {
  const { data, b, c } = fixture();
  assert.deepEqual(C.queryBlocks(data, 'search:"Pricing options"').map(e => e.block.id), [b.id]);
  assert.deepEqual(C.queryBlocks(data, '{and: [[A]] {search: pricing}}').map(e => e.block.id), [b.id, c.id]);
  assert.equal(parseQuery('search:"a \\"quote\\""'.replaceAll('\\\\', '\\')).children[0].type, 'text');
  assert.deepEqual(C.queryBlocks(data, '{search: "other pricing"}').map(e => e.block.id), [c.id]);
});

test('between and daily-notes include date pages and date links, not arbitrary timestamps', () => {
  const { data, day, outside } = fixture();
  assert.deepEqual(C.queryBlocks(data, '{between: [[2026-01-01]] [[2026-12-31]]}').map(e => e.block.id), [day.blocks[0].id, outside.blocks[0].id]);
  assert.equal(C.queryBlocks(data, '{daily-notes:}').length, 2);
  assert.equal(C.queryBlocks(data, '{between: [[today]] [[yesterday]]}', { currentDate: new Date(2026, 9, 31, 12) }).length, 1);
  assert.equal(queryDate('January 1st, 2026'), '2026-01-01');
  assert.equal(queryDate('2026-02-30'), null);
  assert.equal(queryDate('today', '2026-10-31'), '2026-10-31');
  assert.equal(queryDate('last month', '2026-03-31'), '2026-02-28');
  assert.throws(() => C.queryBlocks(data, '{between: [[banana]] [[2026-01-01]]}'), /data inválida/);
});

test('malformed or unsupported syntax fails explicitly without evaluating code', () => {
  for (const query of ['{and: [[A]]', '{not: [[A]] [[B]]}', '{or:}', '{by: [[User]]}', '{daily-notes: [[A]]}', '{search: {and: [[A]]}}', '[[unclosed', '((bad id))', '{between: [[2026-01-01]]}']) {
    assert.throws(() => parseQuery(query), Error, query);
  }
  assert.throws(() => parseQuery('{and: '.repeat(40) + '[[A]]' + '}'.repeat(40)), /complexa/);
  assert.equal(parseQuery('globalThis.injected=true').children[0].value, 'globalThis.injected=true');
  assert.equal(globalThis.injected, undefined);
});

test('query extraction balances nested braces and supports quoted names', () => {
  const text = 'Before {{[[query]]: "My tasks" {and: [[TODO]] {not: [[DONE]]}}}} after {{query: {search: "}"}}}';
  const queries = extractQueries(text);
  assert.equal(queries.length, 2);
  assert.ok(queries.every(query => query.complete));
  assert.equal(parseQuery(text.slice(queries[0].start, queries[0].end)).title, 'My tasks');
  assert.equal(parseQuery(text.slice(queries[1].start, queries[1].end)).children[0].value, '}');
  assert.equal(extractQueries('{{query: {and: [[A]]}')[0].complete, false);
  assert.equal(extractQueries('{{query: [[Curly { page]]}}')[0].complete, true);
});

test('cyclic references do not recurse; malformed cyclic ancestry is rejected', () => {
  const page = C.newPage('Cycle'), a = C.newBlock(), b = C.newBlock();
  a.text = `((${b.id}))`; b.text = `((${a.id}))`; page.blocks = [a, b];
  const data = { version: 1, pages: [page] };
  assert.equal(C.queryBlocks(data, `((${a.id}))`).length, 1);
  const entry = { page, block: a, parent: a };
  assert.throws(() => evaluateQuery([entry], 'word', { extractLinks: C.extractLinks, extractRefs: C.extractRefs }), /circular/);
  const cyclic = { type: 'and', children: [] }; cyclic.children.push(cyclic);
  assert.throws(() => evaluateQuery([], cyclic, { extractLinks: C.extractLinks, extractRefs: C.extractRefs }), /circular/);
});
