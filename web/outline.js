import {newBlock,newPage,uid} from './core.js';
/** Convert a pasted/Markdown outline into blocks without dropping text or code. */
export function parseOutline(text) {
  if(typeof text!=='string')throw Error('Texto inválido.');
  const lines=text.replace(/\r\n?/g,'\n').split('\n'),roots=[],stack=[],idMap=new Map();
  for(let i=0;i<lines.length;i++) {
    const line=lines[i];if(!line.trim())continue;
    const prefix=line.match(/^(\s*)(?:[-*+] |\d+\. )?/),indent=Math.floor(prefix[1].replace(/\t/g,'  ').length/2);let body=line.slice(prefix[0].length);
    if(body.startsWith('```')){const fence=[body];while(++i<lines.length){fence.push(lines[i].replace(new RegExp('^ {0,'+prefix[1].length+'}'),''));if(lines[i].trim().startsWith('```'))break;}body=fence.join('\n');}
    const block=newBlock(body),heading=body.match(/^(#{1,3}) (.*)$/);if(heading){block.heading=heading[1].length;block.text=heading[2];}
    const old=block.text.match(/ \^([A-Za-z0-9_-]{1,128})$/);if(old){idMap.set(old[1],block.id);block.text=block.text.slice(0,old.index);}
    const depth=Math.min(indent,stack.length,99);if(depth===0)roots.push(block);else stack[depth-1].children.push(block);stack[depth]=block;stack.length=depth+1;
  }
  const visit=blocks=>{for(const b of blocks){b.text=b.text.replace(/\(\(([A-Za-z0-9_-]+)\)\)/g,(all,id)=>idMap.has(id)?`((${idMap.get(id)}))`:all);visit(b.children);}};visit(roots);
  return roots.length?roots:[newBlock()];
}
export function markdownPage(filename,text) {
  let title=filename.replace(/\.(md|markdown|txt)$/i,'').trim()||'Importado';const first=text.match(/^# ([^\r\n]+)\r?\n/);if(first){title=first[1].trim();text=text.slice(first[0].length);}
  const page=newPage(title);page.blocks=parseOutline(text);return page;
}
