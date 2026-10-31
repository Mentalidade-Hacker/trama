import test from 'node:test';
import assert from 'node:assert/strict';
import {renderRich,macroAt,safeURL} from '../web/renderer.js';
const ctx={query:q=>`QUERY(${q})`,embedBlock:id=>`EMBED(${id})`,embedPage:p=>`PAGE(${p})`,findBlock:()=>null,math:t=>`MATH(${t})`};
test('balanced query macros preserve nested boolean clauses and surrounding text',()=>{
 const text='before {{[[query]]: {and: [[A]] {not: [[B]]}}}} after';
 assert.equal(macroAt(text,7).body,'[[query]]: {and: [[A]] {not: [[B]]}}');
 assert.match(renderRich(text,ctx),/QUERY\(\{and: \[\[A\]\] \{not: \[\[B\]\]\}\}\) after/);
});
test('HTML and unsafe URL schemes never execute',()=>{
 const html=renderRich('<img onerror=x> [bad](javascript:alert) ![bad](data:whatever)',ctx);
 assert.ok(!html.includes('<img'));assert.match(html,/&lt;img/);assert.equal(safeURL('//evil.test'),null);assert.equal(safeURL('/files/../private'),null);
});
test('aliases, formatting, local media, attributes and code retain safe semantics',()=>{
 assert.match(renderRich('[apelido]([[Página]])',ctx),/data-page="Página"/);
 assert.match(renderRich('[ref](((abc)))',ctx),/data-ref="abc"/);
 assert.match(renderRich('Status:: **ativo** __sim__ ^^marcado^^ ~~fim~~',ctx),/class="attribute"/);
 assert.match(renderRich('![foto](/files/abc.png)',ctx),/class="note-image"/);
 assert.match(renderRich('```js\n<script>\n```',ctx),/&lt;script&gt;/);
});
test('nested task offsets remain offsets in the original raw block',()=>{
 assert.match(renderRich('A **{{[[TODO]]}} B**',ctx,new Set(),'b'),/data-task-offset="4"/);
});
test('macro parser ignores braces inside page titles and balances quoted escapes',()=>{
  const text='{{query: [[Curly { page]]}}';
  assert.equal(macroAt(text,0).body,'query: [[Curly { page]]');
  assert.match(renderRich(text,ctx),/QUERY\(\[\[Curly \{ page\]\]\)/);
});
