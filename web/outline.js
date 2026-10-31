import {newBlock,newPage,rewriteBlockReferences} from './core.js';
/** Convert a pasted/Markdown outline into blocks without dropping text or code. */
export function parseOutline(text,{idMap=new Map(),rewrite=true}={}) {
  if(typeof text!=='string')throw Error('Texto inválido.');
  const lines=text.replace(/\r\n?/g,'\n').split('\n'),roots=[],stack=[];
  for(let i=0;i<lines.length;i++) {
    const line=lines[i];if(!line.trim())continue;
    const prefix=line.match(/^([ \t]*)(?:([-*+] |\d+\. ))?/),width=prefix[1].replace(/\t/g,'  ').length,indent=Math.floor(width/2);let body=line.slice(prefix[0].length);
    if(body.startsWith('```')){
      const fence=[body],contentIndent=width+(prefix[2]?2:0);
      while(++i<lines.length){fence.push(lines[i].replace(new RegExp('^ {0,'+contentIndent+'}'),''));if(lines[i].trim().startsWith('```'))break;}
      body=fence.join('\n');
    } else if(prefix[2]) {
      // Exported Shift+Enter lines belong to their block, not a new child.
      while(i+1<lines.length){
        const next=lines[i+1],leading=next.match(/^[ \t]*/)[0].replace(/\t/g,'  ').length;
        if(!next.trim()){
          let after=i+2;while(after<lines.length&&!lines[after].trim())after++;
          if(after>=lines.length||!/^[ \t]+\S/.test(lines[after])||lines[after].match(/^[ \t]*/)[0].replace(/\t/g,'  ').length<width+2||/^[ \t]*(?:[-*+] |\d+\. )/.test(lines[after]))break;
          body+='\n';i++;continue;
        }
        if(leading<width+2||/^[ \t]*(?:[-*+] |\d+\. )/.test(next))break;
        body+='\n'+next.replace(/^\t/g,'  ').slice(width+2);i++;
      }
    }
    const block=newBlock(body),heading=body.match(/^(#{1,3}) ([\s\S]*)$/);if(heading){block.heading=heading[1].length;block.text=heading[2];}
    const old=block.text.match(/ \^([A-Za-z0-9_-]{1,128})$/);if(old&&(!body.startsWith('```')||/``` \^[A-Za-z0-9_-]{1,128}$/.test(block.text))){idMap.set(old[1],block.id);block.text=block.text.slice(0,old.index);}
    const depth=Math.min(indent,stack.length,99);if(depth===0)roots.push(block);else stack[depth-1].children.push(block);stack[depth]=block;stack.length=depth+1;
  }
  if(rewrite)rewriteOutline(roots,idMap);
  return roots.length?roots:[newBlock()];
}
function rewriteOutline(blocks,idMap) {
  for(const b of blocks){b.text=rewriteBlockReferences(b.text,(id,all)=>idMap.has(id)?`((${idMap.get(id)}))`:all);rewriteOutline(b.children,idMap);}
}
export function markdownPage(filename,text,options) {
  text=text.replace(/^<!-- trama-export-v1 -->\r?\n/,'');
  let title=filename.replace(/\.(md|markdown|txt)$/i,'').trim()||'Importado';const first=text.match(/^# ([^\r\n]+)\r?\n/);if(first){title=first[1].trim();text=text.slice(first[0].length);}
  const page=newPage(title);page.blocks=parseOutline(text,options);return page;
}

/** Only split files explicitly exported by Trama; ordinary Markdown stays one page. */
export function markdownPages(filename,text) {
  if(!/^<!-- trama-export-v1 -->\r?\n/.test(text))return [markdownPage(filename,text)];
  const source=text.replace(/^<!-- trama-export-v1 -->\r?\n/,'').replace(/\r\n?/g,'\n');
  if(!source.trim())return [];
  const idMap=new Map(),pages=source.split(/\n\n---\n\n(?=# )/).map(part=>markdownPage(filename,part,{idMap,rewrite:false}));
  for(const page of pages)rewriteOutline(page.blocks,idMap);
  return pages;
}
