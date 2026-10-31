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

test('v2 preserves literal lists, heading-like text and incomplete fences without changing the hierarchy',()=>{
 const first=newPage('First'),second=newPage('Second');
 const list=newBlock('First line\n- literal continuation\n  1. literal numbered list\n+ literal\n* literal');
 list.children=[newBlock('# literal heading'),newBlock('## another literal heading')];
 const unfinished=newBlock('```js\nconst x = 1;\n- still code');
 unfinished.children=[newBlock('A real child below unfinished code')];
 const reference=newBlock(`((${list.id})) ((${list.children[0].id})) ((${unfinished.id})) ((${second.blocks[0].id}))`);
 first.blocks=[list,unfinished,reference];
 const restored=markdownPages('all.md',exportMarkdown({version:1,pages:[first,second]}));
 assert.equal(restored.length,2);assert.equal(restored[0].blocks.length,3);
 const [savedList,savedCode,savedRef]=restored[0].blocks;
 assert.equal(savedList.text,list.text);assert.equal(savedList.children.length,2);
 assert.equal(savedList.children[0].text,'# literal heading');assert.equal(savedList.children[0].heading||0,0);
 assert.equal(savedList.children[1].text,'## another literal heading');assert.equal(savedList.children[1].heading||0,0);
 assert.equal(savedCode.text,unfinished.text);assert.equal(savedCode.children[0].text,unfinished.children[0].text);
 assert.equal(savedRef.text,`((${savedList.id})) ((${savedList.children[0].id})) ((${savedCode.id})) ((${restored[1].blocks[0].id}))`);
 assert.notEqual(savedList.id,list.id);
});

test('v2 preserves whitespace, literal IDs, metadata-looking prose and inline-code references',()=>{
 const page=newPage('Exact text');
 const samples=['','\n','\n\n','  spaces  ','ends\n','\tindented\n\t- text','^literal','text ^literal',
  '# heading\n\n---\n\n# title','<!-- trama-export-v2 -->\n<!-- trama-block-v2 {"id":"fake","depth":0,"lineCount":1,"heading":0} -->',
  'Português 😀\n中文'];
 page.blocks=samples.map(text=>newBlock(text));
 const id=page.blocks[0].id;
 page.blocks.push(newBlock(`((${id})) \`first\n((${id}))\` and \`\` ((${id})) \`\``));
 const restored=markdownPages('all.md',exportMarkdown({version:1,pages:[page]}))[0];
 assert.deepEqual(restored.blocks.slice(0,-1).map(block=>block.text),samples);
 assert.equal(restored.blocks.at(-1).text,`((${restored.blocks[0].id})) \`first\n((${id}))\` and \`\` ((${id})) \`\``);
});

test('malformed v2 exports fail explicitly instead of silently discarding or reparenting content',()=>{
 const page=newPage('Safe'),parent=newBlock('one\n- literal'),child=newBlock('child');parent.children=[child];page.blocks=[parent,newBlock('after')];
 const original=JSON.stringify(page),source=exportMarkdown({version:1,pages:[page]});
 const invalid=[
  source.replace('"lineCount":2','"lineCount":1'),
  source.replace('"lineCount":2','"lineCount":3'),
  source.replace('"lineCount":2','"lineCount":1e999'),
  source.replace('"depth":0','"depth":1'),
  source.replace('"depth":1','"depth":100'),
  source.replace('"heading":0','"heading":4'),
  source.replace('"heading":0','"heading":1'),
  source.replace('\n  - literal','\n- literal'),
  source.replace('\n  <!-- trama-block-v2','\n<!-- trama-block-v2'),
  source.replace(` ^${parent.id}`,' ^wrong-id'),
  source.replace(/<!-- trama-block-v2 \{[^\n]+/,'<!-- trama-block-v2 {bad JSON} -->'),
  source+ '- unexpected extra text\n',
  source+'---\n',
  source.replaceAll(child.id,parent.id),
 ];
 for(const text of invalid)assert.throws(()=>markdownPages('damaged.md',text),/Markdown v2 inválida/);
 assert.equal(JSON.stringify(page),original);
 assert.throws(()=>markdownPage('all.md',exportMarkdown({version:1,pages:[page,newPage('Second')]})),/várias páginas/);
});

test('legacy v1 exports remain readable with global reference remapping',()=>{
 const source='<!-- trama-export-v1 -->\n# First\n\n- Original ^first\n  continuation ^paragraph\n- ((second)) ^ref\n\n---\n\n# Second\n\n- ## Heading ^second\n';
 const restored=markdownPages('old.md',source);
 assert.deepEqual(restored.map(page=>page.title),['First','Second']);
 assert.equal(restored[0].blocks[0].text,'Original ^first\ncontinuation');
 assert.equal(restored[0].blocks[1].text,`((${restored[1].blocks[0].id}))`);
 assert.equal(restored[1].blocks[0].text,'Heading');assert.equal(restored[1].blocks[0].heading,2);
});
