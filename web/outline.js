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

/** Read explicit export boundaries instead of interpreting the block's prose as Markdown. */
function readMarkdownV2(text,{idMap=new Map(),rewrite=true}={}) {
  const lines=text.replace(/\r\n?/g,'\n').split('\n'),pages=[],stack=[];
  let page=null,expectPage=true;
  const invalid=line=>new Error(`Exportação Markdown v2 inválida na linha ${line+1}. Confira os metadados e as linhas dos blocos; nenhum conteúdo foi importado.`);
  for(let i=1;i<lines.length;i++) {
    const line=lines[i];
    if(!line.trim())continue;
    if(expectPage) {
      if(!line.startsWith('# '))throw invalid(i);
      page=newPage(line.slice(2));page.blocks=[];pages.push(page);stack.length=0;expectPage=false;continue;
    }
    if(line==='---'){expectPage=true;continue;}
    const marker=line.match(/^( *)<!-- trama-block-v2 (\{.*\}) -->$/);
    if(!marker)throw invalid(i);
    let metadata;
    try{metadata=JSON.parse(marker[2]);}catch{throw invalid(i);}
    const {id,depth,lineCount,heading}=metadata;
    if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(id)||idMap.has(id)||
      !Number.isInteger(depth)||depth<0||depth>99||depth>stack.length||marker[1].length!==depth*2||
      !Number.isInteger(lineCount)||lineCount<1||lineCount>lines.length-i-1||
      !Number.isInteger(heading)||heading<0||heading>3)throw invalid(i);
    const indent='  '.repeat(depth),content=[];
    for(let n=0;n<lineCount;n++) {
      const prefix=n===0?`${indent}- ${heading?'#'.repeat(heading)+' ':''}`:`${indent}  `;
      const source=lines[++i];
      if(!source.startsWith(prefix))throw invalid(i);
      content.push(source.slice(prefix.length));
    }
    const suffix=` ^${id}`,last=content.length-1;
    if(!content[last].endsWith(suffix))throw invalid(i);
    content[last]=content[last].slice(0,-suffix.length);
    const block=newBlock(content.join('\n'));if(heading)block.heading=heading;
    idMap.set(id,block.id);
    if(depth===0)page.blocks.push(block);else stack[depth-1].children.push(block);
    stack[depth]=block;stack.length=depth+1;
  }
  if(expectPage&&pages.length)throw invalid(lines.length-1);
  if(rewrite)for(const page of pages)rewriteOutline(page.blocks,idMap);
  return pages;
}

export function markdownPage(filename,text,options) {
  if(/^<!-- trama-export-v2 -->\r?\n/.test(text)){
    const pages=readMarkdownV2(text,options);
    if(pages.length>1)throw Error('O arquivo contém várias páginas. Use a importação de todas as páginas.');
    return pages[0]||newPage(filename.replace(/\.(md|markdown|txt)$/i,'').trim()||'Importado');
  }
  text=text.replace(/^<!-- trama-export-v1 -->\r?\n/,'');
  let title=filename.replace(/\.(md|markdown|txt)$/i,'').trim()||'Importado';const first=text.match(/^# ([^\r\n]+)\r?\n/);if(first){title=first[1].trim();text=text.slice(first[0].length);}
  const page=newPage(title);page.blocks=parseOutline(text,options);return page;
}

/** Only split files explicitly exported by Trama; ordinary Markdown stays one page. */
export function markdownPages(filename,text) {
  if(/^<!-- trama-export-v2 -->\r?\n/.test(text))return readMarkdownV2(text);
  if(!/^<!-- trama-export-v1 -->\r?\n/.test(text))return [markdownPage(filename,text)];
  const source=text.replace(/^<!-- trama-export-v1 -->\r?\n/,'').replace(/\r\n?/g,'\n');
  if(!source.trim())return [];
  const idMap=new Map(),pages=source.split(/\n\n---\n\n(?=# )/).map(part=>markdownPage(filename,part,{idMap,rewrite:false}));
  for(const page of pages)rewriteOutline(page.blocks,idMap);
  return pages;
}
