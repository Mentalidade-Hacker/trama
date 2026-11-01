import {walkBlocks,extractLinks,extractRefs,unlinkedReferences} from './core.js';
import {escapeHTML} from './renderer.js';

export const CONNECTION_LIMITS=Object.freeze({limit:50,maxDepth:3,maxNodes:200,maxText:1200,maxAncestors:5});
const fold=value=>value.trim().normalize('NFC').toLocaleLowerCase('pt-BR');
const bounded=(value,fallback,min,max)=>Number.isInteger(value)?Math.max(min,Math.min(max,value)):fallback;

function limits(options={}) {
  const limit=bounded(options.limit,CONNECTION_LIMITS.limit,1,200);
  return {limit,maxDepth:bounded(options.maxDepth,CONNECTION_LIMITS.maxDepth,0,6),
    maxNodes:bounded(options.maxNodes,CONNECTION_LIMITS.maxNodes,limit,1000),
    maxText:bounded(options.maxText,CONNECTION_LIMITS.maxText,80,10000),
    maxAncestors:bounded(options.maxAncestors,CONNECTION_LIMITS.maxAncestors,2,12)};
}

function indexGraph(data) {
  const entries=walkBlocks(data.pages);
  return {entries,byId:new Map(entries.map(entry=>[entry.block.id,entry]))};
}

function ancestors(entry,index) {
  const path=[],seen=new Set([entry.block.id]);
  let parent=entry.parent;
  while(parent&&!seen.has(parent.id)) {
    seen.add(parent.id);
    const found=index.byId.get(parent.id);
    if(!found)break;
    path.unshift(found);parent=found.parent;
  }
  return path;
}

function panel(entries,index,kind,options={},targetId=null) {
  const config=limits(options),selected=entries.slice(0,config.limit);
  const matches=new Set(selected.map(entry=>entry.block.id)),rendered=new Set(),groups=new Map();
  // Reserve room for every selected match, so a large first subtree cannot
  // hide the remaining matches. Only context descendants consume this budget.
  let contextBudget=config.maxNodes-selected.length,nodeCount=0,truncated=false;
  function preview(entry,depth) {
    const direct=matches.has(entry.block.id);
    if(!direct&&contextBudget<=0)return null;
    if(!direct)contextBudget--;
    rendered.add(entry.block.id);nodeCount++;
    const node={entry,direct,self:direct&&entry.block.id===targetId,children:[],omittedChildren:0};
    for(const child of entry.block.children) {
      const found=index.byId.get(child.id);
      if(!found)continue;
      if(depth>=config.maxDepth) {node.omittedChildren++;continue;}
      const result=preview(found,depth+1);
      if(result)node.children.push(result);else node.omittedChildren++;
    }
    if(node.omittedChildren)truncated=true;
    return node;
  }
  for(const entry of selected) {
    // A referencing child already displayed under a matching ancestor is not
    // repeated as another result. Its direct-reference identity remains visible.
    if(rendered.has(entry.block.id))continue;
    const path=ancestors(entry,index),key=entry.page.id+'\0'+(entry.parent?.id||'');
    if(!groups.has(key))groups.set(key,{page:entry.page,ancestors:path,nodes:[]});
    groups.get(key).nodes.push(preview(entry,0));
  }
  return {kind,total:entries.length,shown:selected.length,hidden:Math.max(0,entries.length-selected.length),
    groups:[...groups.values()],nodeCount,truncated,limits:config};
}

export function pageConnections(data,page,options={}) {
  const index=indexGraph(data),title=fold(page.title);
  const linked=index.entries.filter(({block})=>extractLinks(block.text).some(value=>fold(value)===title));
  const unlinked=unlinkedReferences(data,page.title).map(entry=>index.byId.get(entry.block.id));
  return {linked:panel(linked,index,'linked',options),unlinked:panel(unlinked,index,'unlinked',options)};
}

export function blockConnections(data,entry,options={}) {
  const index=indexGraph(data),id=entry.block.id;
  const incoming=index.entries.filter(({block})=>extractRefs(block.text).includes(id));
  return panel(incoming,index,'block',options,id);
}

function excerpt(text,limit) {
  if(text.length<=limit)return {text,truncated:false};
  let end=limit;
  const code=text.charCodeAt(end-1);
  if(code>=0xd800&&code<=0xdbff)end--;
  return {text:text.slice(0,end)+'…',truncated:true};
}

function blockLink(entry,label,esc,classes='') {
  const accessible=classes==='connection-open'?' aria-label="Abrir bloco original" title="Abrir bloco original"':'';
  return `<a class="${classes}" href="#p/${encodeURIComponent(entry.page.id)}/b/${encodeURIComponent(entry.block.id)}" data-ref="${esc(entry.block.id)}"${accessible}>${esc(label)}</a>`;
}

function trail(group,config,esc) {
  const page=`<a href="#p/${encodeURIComponent(group.page.id)}" data-page="${esc(group.page.title)}">${esc(group.page.title)}</a>`;
  let path=group.ancestors;
  if(path.length>config.maxAncestors)path=[path[0],{omitted:path.length-config.maxAncestors},...path.slice(-(config.maxAncestors-1))];
  return `<nav class="connection-trail" aria-label="Contexto da referência">${page}${path.map(entry=>
    `<span class="connection-separator" aria-hidden="true">›</span>${entry.omitted?
      `<span class="connection-ancestor-gap">… ${entry.omitted} ${entry.omitted===1?'nível':'níveis'}</span>`:
      blockLink(entry,excerpt(entry.block.text||'(bloco vazio)',80).text,esc)}`).join('')}</nav>`;
}

function nodeHTML(node,model,options,title,prefix,rootId) {
  const {entry}=node,esc=options.esc||escapeHTML,scope=prefix+'-'+model.kind+'-'+encodeURIComponent(rootId)+'-'+encodeURIComponent(entry.block.id);
  let body;
  if(options.renderBlock) {
    body=`<ul class="outline connection-editable">${options.renderBlock({...entry.block,children:[]},scope)}</ul>`;
  } else {
    const part=excerpt(entry.block.text,model.limits.maxText);
    // A reference preview must not recursively expand another page/query.
    // Ordinary formatting, aliases and inline block references still use rich.
    const expands=/\{\{\s*(?:(?:\[\[)?(?:embed|query)(?:\]\])?\s*:|:q\b)/i.test(part.text);
    const html=!part.truncated&&!expands&&options.rich?options.rich(part.text,new Set([entry.block.id]),entry.block.id):esc(part.text);
    body=`<div class="connection-text" data-goto="${esc(entry.block.id)}">${html||'<span class="connection-empty-block">(bloco vazio)</span>'}</div>`;
    if(part.truncated)body+='<small class="connection-preview-note">Trecho do bloco; abra o original para ler tudo.</small>';
  }
  const label=node.self?'Referência ao próprio bloco':node.direct?(model.kind==='unlinked'?'Menção sem link':'Referência direta'):'Contexto · bloco filho';
  const linkButton=node.direct&&model.kind==='unlinked'?`<button type="button" class="secondary connection-link-mention" data-link-mention="${esc(entry.block.id)}" data-title="${esc(title)}">Vincular menção</button>`:'';
  const children=node.children.length?`<ul class="connection-children">${node.children.map(child=>nodeHTML(child,model,options,title,prefix,rootId)).join('')}</ul>`:'';
  const omitted=node.omittedChildren?`<p class="connection-preview-note">${node.omittedChildren} ${node.omittedChildren===1?'bloco filho não exibido':'blocos filhos não exibidos'} neste trecho. ${blockLink(entry,'Ver no original',esc)}</p>`:'';
  return `<li class="connection-node ${node.direct?'connection-direct':'connection-context'}" data-connection-node="${esc(entry.block.id)}" data-connection-kind="${node.direct?'direct':'context'}"><div class="connection-node-heading"><small class="connections-sr-only">${label}</small>${blockLink(entry,'↗',esc,'connection-open')}</div>${body}${linkButton}${children}${omitted}</li>`;
}

function panelHTML(model,options,title,prefix) {
  const esc=options.esc||escapeHTML;
  const labels={linked:['Referências vinculadas','As notas que mencionarem esta página aparecerão aqui.'],
    unlinked:['Menções sem link','Nenhuma menção sem link encontrada.'],block:['Referências a este bloco','Nenhum outro bloco faz referência a este bloco.']};
  const [label,empty]=labels[model.kind];
  const filter=model.total?`<label class="connection-filter"><span class="connections-sr-only">Filtrar ${model.kind==='unlinked'?'menções':'referências'}</span><input class="reference-filter" data-reference-filter placeholder="Filtrar por texto ou contexto…" aria-label="Filtrar ${esc(label.toLocaleLowerCase('pt-BR'))}"></label>`:'';
  const countNote=model.hidden?`<p class="connection-limit" role="status">Mostrando ${model.shown} de ${model.total} blocos. ${model.hidden} não ${model.hidden===1?'exibido':'exibidos'} nesta lista; as notas continuam completas.</p>`:'';
  const groups=model.groups.map(group=>`<section class="reference-group connection-group">${trail(group,model.limits,esc)}<ul class="connection-results">${group.nodes.map(node=>nodeHTML(node,model,options,title,prefix,node.entry.block.id)).join('')}</ul></section>`).join('');
  return `<details class="references connections-panel" data-connections data-connections-kind="${model.kind}" ${model.kind==='unlinked'?'':'open'}><summary title="A contagem considera os blocos que fazem a ligação; filhos são contexto.">${label} <span>${model.total}</span></summary>${model.total?'<p class="connections-sr-only">A contagem considera os blocos que fazem a ligação. Os filhos aparecem apenas como contexto.</p>':''}${filter}${countNote}${groups||`<p class="empty-state">${empty}</p>`}</details>`;
}

export function renderPageConnections(data,page,options={}) {
  const model=pageConnections(data,page,options),prefix=options.scope||'connections-page-'+page.id;
  return panelHTML(model.linked,options,page.title,prefix)+panelHTML(model.unlinked,options,page.title,prefix);
}

export function renderBlockConnections(data,entry,options={}) {
  return panelHTML(blockConnections(data,entry,options),options,'',options.scope||'connections-block-'+entry.block.id);
}
