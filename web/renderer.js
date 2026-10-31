/** Rendering helpers: no user HTML or JavaScript is executed. */
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function safeURL(url,{localOnly=false}={}) {
  if(/^\/files\/[A-Za-z0-9_.-]+$/.test(url))return url;
  if(!localOnly&&/^https?:\/\/[^\s<>"']+$/i.test(url))return url;
  return null;
}

export function macroAt(text,start) {
  if(text.slice(start,start+2)!=='{{')return null;
  let depth=0,quote=false,escaped=false,pageDepth=0;
  for(let i=start;i<text.length;i++) {
    if(quote){if(escaped){escaped=false;continue;}if(text[i]==='\\'){escaped=true;continue;}if(text[i]==='"')quote=false;continue;}
    if(text.slice(i,i+2)==='[['){pageDepth++;i++;continue;}
    if(pageDepth&&text.slice(i,i+2)===']]'){pageDepth--;i++;continue;}
    if(pageDepth)continue;
    if(text[i]==='"'){quote=true;continue;}
    if(text[i]==='{')depth++;
    if(text[i]==='}'&&--depth===0)return {start,end:i+1,body:text.slice(start+2,i-1)};
  }
  return null;
}

export function renderRich(text,ctx,seen=new Set(),owner=null,base=0) {
  const esc=escapeHTML;
  if(seen.size>12)return '<span class="missing">Referência circular ou profunda demais</span>';
  let output='',position=0;
  const trigger=/\{\{|```|\$\$|\[|!\[|#|\(\(|\*\*|__|\^\^|~~|`/g;
  while(position<text.length) {
    trigger.lastIndex=position;const next=trigger.exec(text);
    if(!next){output+=esc(text.slice(position));break;}
    const start=next.index;output+=esc(text.slice(position,start));const tail=text.slice(start);let consumed=0,html='';
    const macro=macroAt(text,start);
    if(macro) {
      const body=macro.body.trim(),m=body.match(/^(?:\[\[([^\]]+)\]\]|([\w-]+))\s*(?::([\s\S]*))?$/),name=(m?.[1]||m?.[2]||'').toLowerCase(),arg=m?.[3]?.trim()||'';
      consumed=macro.end-start;
      if(name==='todo'||name==='done')html=`<input type="checkbox" class="task" aria-label="Concluir tarefa" data-task="${esc(owner||'')}" data-task-offset="${base+start}" ${name==='done'?'checked':''}>`;
      else if(name==='query')html=ctx.query(arg,owner);
      else if(/^:q\s/.test(body))html=ctx.datalog?ctx.datalog(body.slice(2).trim()):esc(text.slice(start,macro.end));
      else if(name==='embed') {
        const ref=arg.match(/^\(\(([A-Za-z0-9_-]+)\)\)$/),page=arg.match(/^\[\[([^\]]+)\]\]$/);
        if(ref)html=ctx.embedBlock(ref[1],seen);
        else if(page)html=ctx.embedPage(page[1],seen);
        else html='<span class="missing">Use {{embed: ((id))}} ou {{embed: [[Página]]}}</span>';
      } else if(['pdf','audio','video','iframe'].includes(name)) {
        const url=safeURL(arg,{localOnly:true});
        if(url&&name==='pdf')html=`<iframe class="pdf-embed" src="${esc(url)}" title="Documento PDF"></iframe><a href="${esc(url)}" target="_blank" rel="noopener">Abrir PDF ↗</a>`;
        else if(url&&name==='audio')html=`<audio controls preload="metadata" src="${esc(url)}"></audio>`;
        else if(url&&name==='video')html=`<video controls preload="metadata" src="${esc(url)}"></video>`;
        else {const external=safeURL(arg);html=external?`<a href="${esc(external)}" target="_blank" rel="noopener noreferrer">Abrir ${esc(name)} ↗</a>`:esc(text.slice(start,macro.end));}
      } else if(name==='button')html=`<button class="secondary" data-template-button="${esc(arg.match(/\(\(([^)]+)\)\)/)?.[1]||'')}" data-template-target="${esc(owner||'')}">Inserir template</button>`;
      else html=esc(text.slice(start,macro.end));
    } else if(tail.startsWith('```')) {
      const end=text.indexOf('```',start+3);
      if(end>=0){const content=text.slice(start+3,end),line=content.indexOf('\n'),lang=line>=0?content.slice(0,line):'',code=line>=0?content.slice(line+1):content;consumed=end+3-start;html=`<pre class="code-block"><span>${esc(lang||'código')}</span><code>${esc(code)}</code></pre>`;}
    } else if(tail.startsWith('$$')) {
      const end=text.indexOf('$$',start+2);if(end>=0){consumed=end+2-start;html=ctx.math(text.slice(start+2,end),false);}
    }
    if(!consumed) {
      const alias=tail.match(/^\[([^\]\n]+)\]\((\[\[([^\]]+)\]\]|\(\(([A-Za-z0-9_-]+)\)\))\)/);
      const image=tail.match(/^!\[([^\]\n]*)\]\(([^\s)]+)\)/);
      const page=tail.match(/^(#?)\[\[([^\]\n]+)\]\]/);
      const link=tail.match(/^\[([^\]\n]+)\]\(([^\s)]+)\)/);
      const tag=tail.match(/^#([\p{L}\p{N}_][\p{L}\p{N}_/-]*)/u);
      const ref=tail.match(/^\(\(([A-Za-z0-9_-]+)\)\)/);
      const format=tail.match(/^(\*\*|__|\^\^|~~)([\s\S]+?)\1/);
      const code=tail.match(/^`([^`]+)`/);
      if(alias){consumed=alias[0].length;html=`<a href="#" ${alias[3]?`data-page="${esc(alias[3])}"`:`data-ref="${esc(alias[4])}"`}>${esc(alias[1])}</a>`;}
      else if(image){consumed=image[0].length;const url=safeURL(image[2],{localOnly:true});html=url?`<img class="note-image" src="${esc(url)}" alt="${esc(image[1])}" loading="lazy">`:safeURL(image[2])?`<a href="${esc(image[2])}" target="_blank" rel="noopener noreferrer">Imagem externa: ${esc(image[1]||image[2])} ↗</a>`:esc(image[0]);}
      else if(page){consumed=page[0].length;html=`<a href="#" class="page-link ${page[1]?'tag':''}" data-page="${esc(page[2])}">${page[1]}<span class="bracket">[[</span>${esc(page[2])}<span class="bracket">]]</span></a>`;}
      else if(link){consumed=link[0].length;const url=safeURL(link[2]);html=url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(link[1])} ↗</a>`:esc(link[0]);}
      else if(tag&&!/[\p{L}\p{N}_/]/u.test(text[start-1]||' ')){consumed=tag[0].length;html=`<a href="#" class="tag" data-page="${esc(tag[1])}">#${esc(tag[1])}</a>`;}
      else if(ref){consumed=ref[0].length;const entry=ctx.findBlock(ref[1]);if(!entry)html='<span class="block-ref missing">((bloco ausente))</span>';else if(seen.has(ref[1]))html='<span class="block-ref missing">↻ referência circular</span>';else html=`<span class="block-ref" role="link" tabindex="0" data-ref="${esc(ref[1])}" title="${esc(entry.page.title)}">${renderRich(entry.block.text,ctx,new Set([...seen,ref[1]]),entry.block.id)||'(bloco vazio)'}</span>`;}
      else if(format){consumed=format[0].length;const tagName={'**':'strong','__':'em','^^':'mark','~~':'s'}[format[1]];html=`<${tagName}>${renderRich(format[2],ctx,seen,owner,base+start+2)}</${tagName}>`;}
      else if(code){consumed=code[0].length;html=`<code>${esc(code[1])}</code>`;}
    }
    if(!consumed){consumed=1;html=esc(text[start]);}
    output+=html;position=start+consumed;
  }
  const attribute=text.match(/^([^:\n]+)::/);
  if(attribute&&!attribute[1].includes('[[')) {
    const prefix=esc(attribute[1])+'::';
    if(output.startsWith(prefix))output=`<a class="attribute" href="#" data-page="${esc(attribute[1].trim())}">${esc(attribute[1])}::</a>`+output.slice(prefix.length);
  }
  return output;
}
