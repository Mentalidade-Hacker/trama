import test from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../web/core.js';

const graph = () => ({ version: 1, pages: [core.newPage('Origem'), core.newPage('Destino')] });

test('page and block links handle unicode, deduplication and boundaries', () => {
  assert.deepEqual(core.extractLinks('[[Meu projeto]] #[[Meu projeto]] #ação #AÇÃO #tag/sub-tag http://x/#fragment palavra#não'), ['Meu projeto', 'ação', 'tag/sub-tag']);
  assert.deepEqual(core.extractRefs('((abc-123)) {{embed: ((abc-123))}} ((another_uid))'), ['abc-123', 'another_uid']);
});

test('backlinks, unlinked mentions and graph update from text and references', () => {
  const data = graph();
  data.pages[0].blocks[0].text = 'Usar [[Destino]] e #Destino';
  data.pages[0].blocks.push(core.newBlock('destino aparece sem link'));
  data.pages[1].blocks[0].text = `((${data.pages[0].blocks[0].id}))`;
  assert.equal(core.backlinks(data, 'destino').length, 1);
  assert.equal(core.unlinkedReferences(data, 'Destino').length, 1);
  assert.deepEqual(core.graphData(data).edges, [
    { source: data.pages[0].id, target: data.pages[1].id },
    { source: data.pages[1].id, target: data.pages[0].id },
  ]);
  assert.equal(core.ensurePage(data, 'DESTINO'), data.pages[1]);
  assert.equal(data.pages.length, 2);
});

test('rename preserves markup, tag boundaries and literal special characters', () => {
  const data = graph();
  data.pages[0].blocks[0].text = '[[Destino]] #[[destino]] #Destino #DestinoExtra palavra#Destino /#Destino Destino';
  core.renamePage(data, data.pages[1].id, 'Plano $1 (A+B)');
  assert.equal(data.pages[0].blocks[0].text, '[[Plano $1 (A+B)]] #[[Plano $1 (A+B)]] #[[Plano $1 (A+B)]] #DestinoExtra palavra#Destino /#Destino Destino');
  assert.throws(() => core.renamePage(data, data.pages[1].id, 'origem'), /Já existe/);
  assert.throws(() => core.renamePage(data, data.pages[1].id, '  '), /título/);
});

test('unlinked mention insertion never corrupts links, URLs, tags or code', () => {
  assert.equal(core.unlinkedMentionIndex('[[Category]] #Cat `Cat` https://example.com/Cat [Cat](https://example.com) ((Cat))', 'Cat'), -1);
  assert.equal(core.unlinkedMentionIndex('Uma categoria e Cat no texto', 'Cat'), 16);
  assert.equal(core.unlinkedMentionIndex('Concatenar não é Catálogo', 'Cat'), -1);
  const text = '[[Ação]] #Ação mas ação no texto';
  const index = core.unlinkedMentionIndex(text, 'AÇÃO');
  assert.equal(text.slice(index, index + 4), 'ação');
  assert.equal(core.unlinkedMentionIndex('Use C++ (A+B) com cuidado', 'C++ (A+B)'), 4);
});

test('hierarchical block mutations move whole subtrees and preserve identities', () => {
  const data = graph();
  const page = data.pages[0];
  const a = core.newBlock('a');
  const b = core.newBlock('b');
  const child = core.newBlock('child');
  b.children.push(child);
  page.blocks = [a, b, core.newBlock('c')];
  assert.equal(core.indentBlock(data, b.id), true);
  assert.equal(core.findBlock(data, child.id).depth, 2);
  assert.equal(core.findBlock(data, b.id).parent, a);
  assert.equal(core.outdentBlock(data, b.id), true);
  assert.equal(page.blocks[1], b);
  assert.equal(core.moveBlock(data, b.id, 1), true);
  assert.equal(page.blocks[2], b);
  assert.equal(core.moveBlock(data, b.id, 1), false);
  assert.equal(core.removeBlock(data, b.id), true);
  assert.equal(core.findBlock(data, child.id), undefined);
  page.blocks = [a];
  core.removeBlock(data, a.id);
  assert.equal(page.blocks.length, 1);
  assert.equal(page.blocks[0].text, '');
});

test('Trama import roundtrips without mutating input', () => {
  const data = graph();
  data.pages[0].blocks[0].text = '[[Destino]]';
  const imported = core.importData(JSON.stringify(data));
  assert.deepEqual(imported, data);
  imported.pages[0].title = 'changed';
  assert.equal(data.pages[0].title, 'Origem');
});

test('Roam import preserves block UID, hierarchy, timestamps and references', () => {
  const imported = core.importData([{ title: 'Importado', uid: 'page_uid', 'create-time': 1000, children: [{ uid: 'block_uid', string: '[[Destino]]', open: false, children: [{ uid: 'child_uid', string: '((block_uid))' }] }] }]);
  assert.equal(imported.pages[0].created, '1970-01-01T00:00:01.000Z');
  assert.equal(imported.pages[0].blocks[0].collapsed, true);
  assert.equal(core.findBlock(imported, 'child_uid').parent.id, 'block_uid');
  assert.equal(core.importData([{ title: 'Vazia' }]).pages[0].blocks.length, 1);
});

test('imports reject malformed data, duplicate IDs and duplicate titles atomically', () => {
  const data = graph();
  const copy = structuredClone(data);
  copy.pages[1].blocks[0].id = copy.pages[0].id;
  assert.throws(() => core.importData(copy), /duplicado/);
  copy.pages[1].blocks[0].id = 'valid';
  copy.pages[1].title = 'ORIGEM';
  assert.throws(() => core.importData(copy), /Título duplicado/);
  assert.throws(() => core.importData({ version: 2, pages: [] }), /Formato/);
  assert.throws(() => core.importData([{ title: 'Page', children: [{ string: 12 }] }]), /Texto/);
  assert.throws(() => core.importData({ version: 1, pages: [{ ...data.pages[0], created: 'invalid' }] }), /Data/);
  assert.deepEqual(data.pages.map(page => page.title), ['Origem', 'Destino']);
});

test('query ANDs linked titles and text and ignores its definition', () => {
  const data = graph();
  data.pages[0].blocks = [core.newBlock('Ler [[Destino]] #urgente hoje'), core.newBlock('Ler [[Destino]] amanhã'), core.newBlock('{{query: [[Destino]] #urgente hoje}}')];
  assert.equal(core.queryBlocks(data, '[[Destino]] #urgente hoje').length, 1);
  assert.equal(core.queryBlocks(data, '[[Destino]] Ler').length, 2);
  assert.equal(core.queryBlocks(data, '"amanhã"').length, 1);
  assert.equal(core.queryBlocks(data, '').length, 0);
});

test('Markdown export keeps hierarchy, links, multiline blocks and stable IDs', () => {
  const data = graph();
  data.pages[0].blocks[0].text = 'First\nsecond';
  const child = core.newBlock('[[Destino]]');
  data.pages[0].blocks[0].children.push(child);
  const markdown = core.exportMarkdown(data);
  assert.ok(markdown.startsWith('<!-- trama-export-v2 -->\n# Origem\n\n<!-- trama-block-v2 '));
  assert.ok(markdown.includes('\n- First\n  second'));
  assert.ok(markdown.includes(JSON.stringify({id:data.pages[0].blocks[0].id,depth:0,lineCount:2,heading:0})));
  assert.ok(markdown.includes(`  - [[Destino]] ^${child.id}`));
  assert.ok(markdown.includes(`\n  <!-- trama-block-v2 ${JSON.stringify({id:child.id,depth:1,lineCount:1,heading:0})} -->\n  - [[Destino]]`));
});

test('attributes link their names and rename without changing values', () => {
  const data = graph();
  const status = core.ensurePage(data, 'Status');
  data.pages[0].blocks[0].text = 'Status:: [[Active]]\n[[Status]]:: Status remains a value\nOther:: text';
  assert.deepEqual(core.attributesOf(data.pages[0].blocks[0].text), [{ name: 'Status', value: '[[Active]]' }, { name: 'Status', value: 'Status remains a value' }, { name: 'Other', value: 'text' }]);
  assert.ok(core.extractLinks(data.pages[0].blocks[0].text).includes('Other'));
  assert.equal(core.backlinks(data, 'Status').length, 1);
  core.renamePage(data, status.id, 'Work: status');
  assert.equal(data.pages[0].blocks[0].text, '[[Work: status]]:: [[Active]]\n[[Work: status]]:: Status remains a value\nOther:: text');
});

test('templates clone children, remap internal references and preserve external references', () => {
  const data = graph(), template = core.newBlock('Meeting #roam/templates'), a = core.newBlock('<%today%> [[Meeting]]'), b = core.newBlock();
  a.heading = 2; b.text = `((${a.id})) {{embed: ((${a.id}))}} ((outside)) <%tomorrow%> <%yesterday%>`;
  template.children = [a, b]; data.pages[0].blocks.push(template);
  const target = data.pages[1].blocks[0], created = core.instantiateTemplate(data, template.id, target.id, new Date(2026, 9, 31, 12));
  assert.equal(core.listTemplates(data)[0].label, 'Meeting');
  assert.equal(created.length, 2);
  assert.notEqual(created[0].id, a.id);
  assert.equal(created[0].text, '2026-10-31 [[Meeting]]');
  assert.equal(created[0].heading, 2);
  assert.equal(created[1].text, `((${created[0].id})) {{embed: ((${created[0].id}))}} ((outside)) 2026-11-01 2026-10-30`);
  assert.equal(template.children[0].text, '<%today%> [[Meeting]]');
  assert.equal(target.children[0], created[0]);
});

test('format metadata and IDs roundtrip through Roam JSON', () => {
  const data = graph(), block = data.pages[0].blocks[0];
  block.heading = 3; block.alignment = 'center'; block.view = 'numbered'; block.collapsed = true;
  assert.deepEqual(core.importData(core.exportRoam(data)), data);
  assert.deepEqual(core.importData(data), data);
  assert.throws(() => core.importData({ ...data, pages: [{ ...data.pages[0], blocks: [{ ...block, heading: 4 }] }] }), /título de bloco/);
});

test('merge appends same-title pages and remaps collisions atomically', () => {
  const data = graph(), incoming = structuredClone(data);
  incoming.pages[0].blocks[0].text = `((${incoming.pages[1].blocks[0].id}))`;
  const originalId = data.pages[1].blocks[0].id;
  core.mergeGraph(data, incoming);
  assert.equal(data.pages.length, 2);
  assert.equal(data.pages[0].blocks.length, 2);
  assert.notEqual(data.pages[1].blocks[1].id, originalId);
  assert.equal(data.pages[0].blocks[1].text, `((${data.pages[1].blocks[1].id}))`);
  const before = JSON.stringify(data);
  assert.throws(() => core.mergeGraph(data, { version: 2, pages: [] }));
  assert.equal(JSON.stringify(data), before);
});

test('connections ignore code, math, external links and alias labels', () => {
  const text = '`[[Code]] #code ((code))`\n```js\n[[Fence]]\nStatus:: code\n((fence))\n```\n$$[[Math]] ((math))$$ [#label](https://example.test/#external) https://example.test/[[URL]] [#label]([[Real]]) [#ref](((block))) {{embed: [[Embedded]]}}';
  assert.deepEqual(core.extractLinks(text), ['Real', 'Embedded']);
  assert.deepEqual(core.extractRefs(text), ['block']);
  assert.deepEqual(core.attributesOf(text), []);
  assert.equal(core.unlinkedMentionIndex('```\nReal\n``` $$Real$$ [Real]([[Other]])', 'Real'), -1);
  assert.deepEqual(core.extractLinks('[[https://example.test]] [[Word]]'), ['https://example.test', 'Word']);
  assert.deepEqual(core.extractLinks('https://example.test?q=1#fragment HTTPS://example.test/#tag'), []);
  assert.deepEqual(core.extractLinks('```js\n[[Unfinished]] #code ((hidden))'), []);
});

test('renaming updates active aliases, tags and attributes without changing examples', () => {
  const data = graph(), block = data.pages[0].blocks[0];
  block.text = '`[[Destino]]`\n```\nDestino:: example\n[[Destino]]\n```\n$$[[Destino]]$$ [#Destino]([[Destino]]) [Destino](https://example.test/#Destino)\nDestino:: [[Destino]]';
  core.renamePage(data, data.pages[1].id, 'Novo');
  assert.equal(block.text, '`[[Destino]]`\n```\nDestino:: example\n[[Destino]]\n```\n$$[[Destino]]$$ [#Destino]([[Novo]]) [Destino](https://example.test/#Destino)\nNovo:: [[Novo]]');
});

test('literal template tags do not become templates and reference rewriting protects code', () => {
  const data = graph();
  data.pages[0].blocks[0].text = '`#roam/templates`';
  assert.deepEqual(core.listTemplates(data), []);
  assert.equal(core.rewriteBlockReferences('((old)) `((old))` [label](((old)))', id => `((${id}-new))`), '((old-new)) `((old))` [label](((old-new)))');
});

test('multiline inline code and adjacent backticks match renderer literal semantics', () => {
  const data=graph(),block=data.pages[0].blocks[0];
  const literal='`first\n[[Destino]] #Destino ((old))\nDestino:: example` and `` [[Destino]] ((old)) ``';
  block.text=literal+' [[Destino]] ((old))';
  assert.deepEqual(core.extractLinks(literal),[]);
  assert.deepEqual(core.extractRefs(literal),[]);
  assert.deepEqual(core.attributesOf(literal),[]);
  assert.equal(core.rewriteBlockReferences(block.text,()=> '((new))'),literal+' [[Destino]] ((new))');
  core.renamePage(data,data.pages[1].id,'Changed');
  assert.equal(block.text,literal+' [[Changed]] ((old))');
});

test('imports and indentation share the server limit of 100 block levels', () => {
  const data = graph(), page = data.pages[0];
  let current = page.blocks[0];
  for (let i = 1; i < 99; i++) { const child = core.newBlock(String(i)); current.children = [child]; current = child; }
  const first = core.newBlock('first'), last = core.newBlock('last');
  current.children = [first, last];
  assert.doesNotThrow(() => core.importData(data));
  const before = JSON.stringify(data);
  assert.equal(core.indentBlock(data, last.id), false);
  assert.equal(JSON.stringify(data), before);
  last.children.push(core.newBlock('too deep'));
  assert.throws(() => core.importData(data), /100 níveis/);
});
