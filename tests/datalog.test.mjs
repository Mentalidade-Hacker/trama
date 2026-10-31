import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as C from '../web/core.js';
import { runDatalog } from '../web/datalog.js';

const require = createRequire(import.meta.url);
globalThis.datascript = require('../web/vendor/datascript/datascript.js');
function fixture() {
  const a = C.newPage('Alpha'), b = C.newPage('Beta'), first = C.newBlock('[[Beta]] useful text'), child = C.newBlock('Nested');
  first.children.push(child); a.blocks = [first]; b.blocks = [C.newBlock(`((${child.id}))`)];
  return { data: { version: 1, pages: [a, b] }, a, b, first, child };
}

test('official bundle exposes the browser global without CommonJS', () => {
  const context = vm.createContext({ console });
  vm.runInContext(readFileSync(new URL('../web/vendor/datascript/datascript.js', import.meta.url), 'utf8'), context);
  assert.equal(typeof context.datascript.q, 'function');
});

test('raw Roam attribute syntax uses real DataScript joins and references', () => {
  const { data, a, first, child } = fixture();
  assert.deepEqual(runDatalog(data, '[:find ?title :where [?p :node/title ?title]]').rows.sort(), [['Alpha'], ['Beta']]);
  assert.deepEqual(runDatalog(data, '[:find ?text :where [?p :node/title "Beta"] [?b :block/refs ?p] [?b :block/string ?text]]').rows, [['[[Beta]] useful text']]);
  assert.deepEqual(runDatalog(data, `[:find ?uid :where [?p :block/uid "${first.id}"] [?p :block/children ?child] [?child :block/uid ?uid]]`).rows, [[child.id]]);
  assert.deepEqual(runDatalog(data, `[:find ?title :where [?b :block/uid "${child.id}"] [?b :block/page ?p] [?p :node/title ?title]]`).rows, [[a.title]]);
});

test('built-in arithmetic, counts, predicates, scalar and tuple forms work', () => {
  const { data } = fixture();
  assert.equal(runDatalog(data, '[:find (count ?b) . :where [?b :block/string]]').result, 3);
  assert.deepEqual(runDatalog(data, '[:find ?n :where [(+ 2 3) ?n] [(> ?n 4)]]').rows, [[5]]);
  assert.deepEqual(runDatalog(data, '[:find [?a ?b] :where [(+ 1 1) ?a] [(* 3 2) ?b]]').rows, [[2, 6]]);
  assert.deepEqual(runDatalog(data, '[:find [?title ...] :where [?p :node/title ?title]]').rows.sort(), [['Alpha'], ['Beta']]);
});

test('pull returns JSON-safe nested values and preserves keyword-like note text', () => {
  const { data, first } = fixture();
  first.text = ':node/title is text, not syntax';
  const result = runDatalog(data, `[:find (pull ?b [:block/uid :block/string {:block/page [:node/title]}]) :where [?b :block/uid "${first.id}"]]`).result;
  assert.equal(result[0][0][':block/string'], first.text);
  assert.equal(result[0][0][':block/page'][':node/title'], 'Alpha');
  assert.equal(runDatalog(data, '[:find ?b :where [?b :block/string ":node/title is text, not syntax"]]').rows.length, 1);
  assert.doesNotThrow(() => JSON.stringify(result));
});

test('same-object edits invalidate cached database and callers cannot mutate cache', () => {
  const { data } = fixture();
  const query = '[:find ?title :where [?p :node/title ?title]]';
  const result = runDatalog(data, query); result.rows[0][0] = 'Corrupted';
  assert.ok(!JSON.stringify(runDatalog(data, query)).includes('Corrupted'));
  data.pages[0].title = 'Changed';
  assert.deepEqual(runDatalog(data, query).rows.sort(), [['Beta'], ['Changed']]);
});

test('invalid queries and arbitrary JS function calls are rejected without execution', () => {
  const { data } = fixture();
  for (const query of ['[:find ?x :where', '[:find ?x :where [(js/eval "globalThis.injected=1") ?x]]', '[:find ?x :where [(eval "1+1") ?x]]', '#=(globalThis.injected=1)']) {
    assert.throws(() => runDatalog(data, query), Error);
  }
  assert.equal(globalThis.injected, undefined);
  assert.throws(() => runDatalog(data, '['.repeat(20001)), /20.000/);
});

test('type-to-Function escape and dynamic/custom aggregate calls are blocked', () => {
  const { data } = fixture();
  const query = '[:find ?result :where [(type 1) ?Number] [(type ?Number) ?Function] [(?Function "return 7") ?f] [(?f) ?result]]';
  assert.throws(() => runDatalog(data, query), /introspecção/);
  assert.throws(() => runDatalog(data, '[:find ?x :where [( ; comment\n ?f "x") ?x]]'), /chamadas dinâmicas/);
  assert.throws(() => runDatalog(data, '[:find (aggregate ?fn ?x) :where [(identity 1) ?x]]'), /agregadores personalizados/);
  assert.deepEqual(runDatalog(data, '[:find ?text :where [(identity "(type 1) is ordinary text") ?text]]').rows, [['(type 1) is ordinary text']]);
  for (const query of ['[:find ?x :where [(,type,1) ?x]]', '[:find ?x :where [(#_ignored type 1) ?x]]', '[:find ?x :where [(^:tag type 1) ?x]]', '[:find ?x :where [(js/Function "return 1") ?x]]', '[:find ?x :where [(ground \\;) ?char] [(type 1) ?x]]']) {
    assert.throws(() => runDatalog(data, query), /permitida/);
  }
});
