import test from 'node:test';import assert from 'node:assert/strict';
import {parseOutline,markdownPage} from '../web/outline.js';
test('multiline paste preserves hierarchy and headings',()=>{const b=parseOutline('- Parent\n  - Child\n    - Grandchild\n- ## Heading');assert.equal(b.length,2);assert.equal(b[0].children[0].children[0].text,'Grandchild');assert.equal(b[1].heading,2);});
test('code fences preserve line content instead of creating extra blocks',()=>{const b=parseOutline('```js\n  const a = 1;\n- this is code\n```\nafter');assert.equal(b.length,2);assert.match(b[0].text,/- this is code/);assert.equal(b[1].text,'after');});
test('Markdown file titles and internal exported block references survive import',()=>{const p=markdownPage('test.md','# Research\n- Original ^old-id\n- ((old-id))');assert.equal(p.title,'Research');assert.equal(p.blocks[1].text,`((${p.blocks[0].id}))`);});
