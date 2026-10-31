import test from 'node:test';import assert from 'node:assert/strict';
import {parseOutline,markdownPage,markdownPages} from '../web/outline.js';
import {newPage,newBlock,exportMarkdown} from '../web/core.js';
test('multiline paste preserves hierarchy and headings',()=>{const b=parseOutline('- Parent\n  - Child\n    - Grandchild\n- ## Heading');assert.equal(b.length,2);assert.equal(b[0].children[0].children[0].text,'Grandchild');assert.equal(b[1].heading,2);});
test('code fences preserve line content instead of creating extra blocks',()=>{const b=parseOutline('```js\n  const a = 1;\n- this is code\n```\nafter');assert.equal(b.length,2);assert.match(b[0].text,/- this is code/);assert.equal(b[1].text,'after');});
test('Markdown file titles and internal exported block references survive import',()=>{const p=markdownPage('test.md','# Research\n- Original ^old-id\n- ((old-id))');assert.equal(p.title,'Research');assert.equal(p.blocks[1].text,`((${p.blocks[0].id}))`);});

test('exported multiline text, headings and fenced code survive Markdown import',()=>{
 const page=newPage('Research'),paragraph=newBlock('First\nsecond\n\nfourth');paragraph.heading=2;
 paragraph.children=[newBlock('Child')];
 const code=newBlock('```js\n  const value = 1;\n- not a child\n```');
 const reference=newBlock(`((${paragraph.id})) and \`((${paragraph.id}))\``);page.blocks=[paragraph,code,reference];
 const restored=markdownPage('export.md',exportMarkdown({version:1,pages:[page]}));
 assert.equal(restored.blocks.length,3);assert.equal(restored.blocks[0].text,paragraph.text);assert.equal(restored.blocks[0].heading,2);
 assert.equal(restored.blocks[0].children[0].text,'Child');assert.equal(restored.blocks[1].text,code.text);
 assert.equal(restored.blocks[2].text,`((${restored.blocks[0].id})) and \`((${paragraph.id}))\``);
});

test('plain multiline paste remains separate blocks and list continuations remain together',()=>{
 assert.deepEqual(parseOutline('one\ntwo').map(b=>b.text),['one','two']);
 const blocks=parseOutline('- paragraph\n  continued\n  - child\n- next');
 assert.equal(blocks[0].text,'paragraph\ncontinued');assert.equal(blocks[0].children[0].text,'child');assert.equal(blocks[1].text,'next');
});

test('a complete Markdown export restores separate pages and cross-page block references',()=>{
 const first=newPage('First'),second=newPage('Second');
 first.blocks[0].text=`Link [[Second]] and ((${second.blocks[0].id}))`;
 second.blocks[0].text='Other block\n\n---\n\n# stays inside the block';
 const restored=markdownPages('all.md',exportMarkdown({version:1,pages:[first,second]}));
 assert.deepEqual(restored.map(page=>page.title),['First','Second']);
 assert.equal(restored[0].blocks[0].text,`Link [[Second]] and ((${restored[1].blocks[0].id}))`);
 assert.equal(restored[1].blocks[0].text,second.blocks[0].text);
 assert.equal(markdownPages('ordinary.md','# First\n- A\n\n---\n\n# Second\n- B').length,1);
 assert.deepEqual(markdownPages('empty.md',exportMarkdown({version:1,pages:[]})),[]);
});

test('unfinished code fences preserve their final line and do not consume literal IDs',()=>{
 const text='```js\n  const x = "[[Sample]]";\n- still code ^literal';
 const blocks=parseOutline(text);assert.equal(blocks.length,1);assert.equal(blocks[0].text,text);
 const closed=parseOutline('- ```text\n  value\n  ``` ^old\n- ((old))');
 assert.equal(closed[0].text,'```text\nvalue\n```');assert.equal(closed[1].text,`((${closed[0].id}))`);
});
