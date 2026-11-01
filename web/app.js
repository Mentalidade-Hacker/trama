import * as C from './core.js';
import {renderRich} from './renderer.js';
import {renderComponent,bindComponents,renderMath} from './components.js';
import {setupFeatures,commands} from './features.js';
import {parseOutline,markdownPages} from './outline.js';
import {setupSync} from './sync-ui.js';
import {createSyncClient,bindSyncActivity,bindDraftActivity} from './sync-client.js';
import {setupTranslation} from './translation-ui.js';
import {setupLiveWriting} from './live-writing.js';
import {setupDictionary} from './dictionary-ui.js';
import {setupLearning} from './learning-ui.js';
import {setupVocabulary} from './vocabulary-suggestions.js';
import {setupBackup} from './backup-ui.js';
import {setupUpdates} from './update-ui.js';
import { maskMarkup, applySuggestion, isProtectedRange } from './proofread.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let data = {version:1,pages:[]}, revision = 0, dirty = false, saving = false, conflict = false, generation = 0;
let ready=false, liveSync=null, syncUI=null, automaticSync=false;
let current = null, view = 'page', zoom = null, right = null, editing = null, saveTimer, toastTimer;
let datalogCache=new Map();
let F, rightStack=[], selectedBlocks=new Set(), queryOptions=new Map();
let proofLanguage='pt-BR', proofTarget=null, proofSnapshot='', proofMatches=[], proofRequest=0;
try { proofLanguage=localStorage.getItem('trama-proof-language')||'pt-BR'; } catch {}
let undo = [], redo = [], favorites = [], recent = [], suggestions = [], suggestionIndex = 0, completion = null;
try { favorites = JSON.parse(localStorage.getItem('trama-favorites') || '[]'); recent = JSON.parse(localStorage.getItem('trama-recent') || '[]'); } catch {}

const pageById = id => data.pages.find(p => p.id === id);
const todayTitle = () => new Date().toLocaleDateString('sv-SE');
const dateLabel = title => /^\d{4}-\d{2}-\d{2}$/.test(title) ? new Date(title+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}) : '';
function toast(message) { $('#toast').textContent=message; $('#toast').hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('#toast').hidden=true,4500); }
function status(text, error=false) { $('#save-status').textContent=text; $('#save-status').classList.toggle('error',error); }
function checkpoint() { const snap=JSON.stringify(data); if (undo.at(-1)!==snap) undo.push(snap); if(undo.length>80)undo.shift(); redo=[]; }
function persistUI() { try { localStorage.setItem('trama-favorites',JSON.stringify(favorites)); localStorage.setItem('trama-recent',JSON.stringify(recent)); } catch {} }
function materialize() { for(const {block} of C.walkBlocks([...data.pages])) for(const title of C.extractLinks(block.text)) { try { C.ensurePage(data,title); } catch {} } }
function changed(pageId) {
  if(pageId && pageById(pageId))pageById(pageId).updated=new Date().toISOString();
  materialize(); dirty=true; generation++; liveSync?.touch(); status('Alterações pendentes'); clearTimeout(saveTimer); saveTimer=setTimeout(save,450); renderNav();
}
async function save() {
  clearTimeout(saveTimer); if(!dirty || saving || conflict)return;
  saving=true; liveSync?.activity(); const gen=generation; status('Salvando…');
  try {
    const res=await fetch('/api/state',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision,data})});
    const result=await res.json();
    if(res.status===409) { conflict=true; throw Error('Outra janela alterou este grafo. Exporte suas alterações antes de recarregar.'); }
    if(!res.ok)throw Error(result.error || 'Não foi possível salvar.');
    revision=result.revision; dirty=gen!==generation; status(dirty?'Alterações pendentes':'✓ Salvo neste computador');
  } catch(e) { status('⚠ Não salvo — clique aqui',true); $('#save-status').title=e.message; toast(e.message); }
  finally {saving=false; liveSync?.activity(); if(dirty && !conflict && generation!==gen)saveTimer=setTimeout(save,300);}
}
async function flush() { clearTimeout(saveTimer); while(saving)await new Promise(r=>setTimeout(r,50)); await save(); return !dirty; }
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
window.addEventListener('online',()=>save());
$('#save-status').addEventListener('click',()=>{if(dirty)settings();});

function seed() {
  const start=C.ensurePage(data,'Comece aqui'), day=C.ensurePage(data,todayTitle());
  start.blocks=[C.newBlock('Bem-vindo ao **Trama**. Um lugar para pensar em blocos e conectar ideias.'),C.newBlock('Escreva [[Ideias]] para criar uma conexão. A página de destino reúne automaticamente todos os backlinks.'),C.newBlock('Cada tópico é um bloco. Pressione Enter para continuar; Tab para criar um nível abaixo.')];
  start.blocks[2].children=[C.newBlock('Este é um bloco filho. Use Shift+Tab para subir de nível.'),C.newBlock('Recolha esta lista pela seta ao lado do bloco pai.')];
  const reusable=C.newBlock('Uma ideia pode aparecer em vários contextos sem ser copiada.'); start.blocks.push(reusable);
  start.blocks.push(C.newBlock('Abra o menu ⋯ de um bloco para copiar sua referência ou incorporá-lo em outra página.'));
  day.blocks=[C.newBlock('Começar por [[Comece aqui]] e registrar as primeiras [[Ideias]].'),C.newBlock('{{[[TODO]]}} Explorar as conexões entre minhas notas'),C.newBlock(`Uma referência viva: ((${reusable.id}))`),C.newBlock('')];
  C.ensurePage(data,'Ideias').blocks=[C.newBlock('Ideias se desenvolvem quando encontram outras ideias. #Conhecimento'),C.newBlock('Use Shift+clique em um link para abrir uma página no painel lateral.')];
  materialize(); changed();
}
function renderNav() {
  const links=(ids,star=false)=>ids.map(id=>pageById(id)).filter(Boolean).map(p=>`<a class="sidebar-page ${p.id===current?'active':''}" href="#p/${encodeURIComponent(p.id)}">${star?'<span class="star">☆</span>':''}${esc(p.title)}</a>`).join('');
  $('#favorites').innerHTML=links(favorites,true)||'<span class="sidebar-page">Marque páginas com ☆</span>';
  $('#recent').innerHTML=links(recent.slice(0,7));
  $('#stats').textContent=`${data.pages.length} páginas · ${C.walkBlocks(data.pages).length} blocos`;
  document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.action===view || (b.dataset.action==='daily'&&view==='page'&&pageById(current)?.title===todayTitle())));
}
function openPage(title,side=false) {
  let page=C.findPage(data,title); if(!page){checkpoint();page=C.ensurePage(data,title);changed();}
  if(side){pushRight(page.id);return;}
  location.hash=`p/${encodeURIComponent(page.id)}`;
  if(current===page.id&&view==='page'){zoom=null;render();}
}
function openBlock(id,side=false) { const entry=C.findBlock(data,id); if(!entry){toast('Bloco não encontrado.');return;} if(side){pushRight(entry.page.id,id);return;} location.hash=`p/${encodeURIComponent(entry.page.id)}/b/${encodeURIComponent(id)}`; }
function route() {
  editing=null; selectedBlocks.clear(); const parts=location.hash.slice(1).split('/').map(decodeURIComponent);
  if(['graph','pages','journals'].includes(parts[0])){view=parts[0];zoom=null;}
  else {view='page';current=pageById(parts[1])?.id || C.findPage(data,todayTitle())?.id || data.pages[0]?.id;zoom=parts[2]==='b'?parts[3]:null; if(current){recent=[current,...recent.filter(id=>id!==current)].slice(0,20);persistUI();}}
  render();
}
window.addEventListener('hashchange',route);

function rich(text,seen=new Set(),owner=null) {
  return renderRich(text,{findBlock:id=>C.findBlock(data,id),math:renderMath,query:renderQuery,datalog:renderDatalog,
    embedBlock:(id,visited)=>{const e=C.findBlock(data,id);if(!e)return '<span class="missing">Bloco ausente</span>';if(visited.has(id))return '<span class="missing">Referência circular</span>';return `<div class="embed"><a class="embed-label" href="#p/${e.page.id}/b/${id}">↗ ${esc(e.page.title)} · incorporação editável</a><ul class="outline">${blockHTML(e.block,'embed-'+owner+'-'+id,new Set([...visited,id]))}</ul></div>`;},
    embedPage:(title,visited)=>{const p=C.findPage(data,title);if(!p)return `<a href="#" data-page="${esc(title)}">Criar ${esc(title)}</a>`;if(visited.has(p.id))return '<span class="missing">Incorporação circular</span>';return `<div class="embed"><a class="embed-label" href="#p/${p.id}">↗ ${esc(p.title)}</a><ul class="outline">${p.blocks.map(b=>blockHTML(b,'embed-page-'+owner+'-'+p.id,new Set([...visited,p.id,b.id]))).join('')}</ul></div>`;}
  },seen,owner);
}
function renderQuery(query,owner) {
  try {
    let matches=C.queryBlocks(data,`{{query: ${query}}}`).filter(e=>e.block.id!==owner);const opts=queryOptions.get(owner)||{};
    if(opts.sort==='text')matches.sort((a,b)=>a.block.text.localeCompare(b.block.text));
    else matches.sort((a,b)=>a.page.title.localeCompare(b.page.title));
    const groups=new Map();for(const e of matches){const key=opts.group===false?'Resultados':e.page.title;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(e);}
    return `<div class="query"><div class="query-toolbar"><span>CONSULTA · ${matches.length} resultados</span><button data-query-builder="${esc(owner||'')}">⚙ Editar</button><button data-query-group="${esc(owner||'')}">Agrupar</button><button data-query-sort="${esc(owner||'')}">Ordenar</button><button data-query-refresh>↻</button></div>${[...groups].map(([title,entries])=>`<div class="query-group"><strong>${esc(title)}</strong>${entries.slice(0,100).map(e=>`<div class="query-result"><button data-result-edit="${esc(e.block.id)}" title="Editar bloco original">✎</button><a data-ref="${esc(e.block.id)}" href="#p/${e.page.id}/b/${e.block.id}">${esc(e.block.text||'(bloco vazio)')}</a>${e.parent?`<small>↳ ${esc(e.parent.text.slice(0,70))}</small>`:''}</div>`).join('')}</div>`).join('')||'<p class="empty-state">Nenhum resultado.</p>'}${matches.length>100?'<small>Até 100 resultados exibidos por grupo.</small>':''}</div>`;
  }catch(error){return `<div class="query error-banner">${esc(error.message)} <button data-query-builder="${esc(owner||'')}">Editar consulta</button></div>`;}
}
function datalogTable(result){if(result.error)return `<p class="error-banner">${esc(result.error)}</p>`;const rows=result.rows||[];return `<div class="datalog-results"><small>${rows.length} resultados${rows.length>200?' · exibindo 200':''}</small><table>${rows.slice(0,200).map(row=>`<tr>${(Array.isArray(row)?row:[row]).map(value=>`<td><code>${esc(typeof value==='object'?JSON.stringify(value):String(value))}</code></td>`).join('')}</tr>`).join('')}</table></div>`;}
function renderDatalog(query){
  const key=JSON.stringify([generation,revision,query]);let cached=datalogCache.get(key);
  if(cached)return `<div class="datalog" data-datalog="${esc(cached.id)}">${cached.result?datalogTable(cached.result):'Executando consulta Datalog local…'}</div>`;
  const id=C.uid(),worker=new Worker('/datalog-worker.js');cached={id,worker};datalogCache.set(key,cached);
  if(datalogCache.size>15){const first=datalogCache.keys().next().value;datalogCache.get(first).worker?.terminate();datalogCache.delete(first);}
  const finish=result=>{clearTimeout(timer);worker.terminate();cached.worker=null;cached.result=result;document.querySelectorAll(`[data-datalog="${id}"]`).forEach(el=>el.innerHTML=datalogTable(result));};
  const timer=setTimeout(()=>finish({error:'Consulta interrompida após 8 segundos. Restrinja os critérios.'}),8000);
  worker.onmessage=e=>finish(e.data);worker.onerror=()=>finish({error:'Não foi possível executar o motor Datalog local.'});worker.postMessage({data,query});
  return `<div class="datalog" data-datalog="${id}">Executando consulta Datalog local…</div>`;
}

function componentContext(){return {getData:()=>data,data,rich,escape:esc,findBlock:id=>C.findBlock(data,id),newBlock:C.newBlock,checkpoint,changed,render,edit:componentEdit,toast};}
function componentEdit(id){const e=C.findBlock(data,id);if(!e)return;current=e.page.id;view='page';zoom=id;history.replaceState(null,'','#p/'+current+'/b/'+id);edit(id,'main');}
function blockHTML(block,scope='main',seen=new Set([block.id])) {
  // The portable vocabulary marker is storage metadata, not a study exercise.
  if(block.text.startsWith('```trama-vocabulary-choice-v1\n'))return '';
  const active=editing?.id===block.id&&editing?.scope===scope;
  let component=null;if(!active){try{component=F?.specialHTML(block)??renderComponent(block,componentContext());}catch(error){component=`<div class="error-banner">${esc(error.message)}</div>`;}}
  const hideChildren=component&&/^\{\{(?:\[\[)?(?:table|kanban)(?:\]\])?\}\}$/i.test(block.text.trim());
  const heading=block.heading||0,mode=block.view||'bullet';
  return `<li class="block block-heading-${heading} view-${mode} ${selectedBlocks.has(block.id)?'selected-block':''}" data-id="${esc(block.id)}" data-scope="${scope}" style="text-align:${['left','center','right'].includes(block.alignment)?block.alignment:'left'}"><div class="block-line"><button class="collapse" data-collapse="${esc(block.id)}" aria-label="${block.collapsed?'Expandir':'Recolher'} bloco">${block.children.length?(block.collapsed?'▸':'▾'):''}</button><button class="bullet ${block.children.length?'has-children':''}" draggable="true" data-zoom="${esc(block.id)}" title="Focar; Shift+clique seleciona vários blocos; arraste para mover" aria-label="Focar no bloco"></button><div class="block-body">${active?`<textarea class="block-editor" spellcheck="true" lang="${esc(proofLanguage)}" aria-label="Editar bloco" data-editor="${esc(block.id)}" rows="1" maxlength="1000000">${esc(block.text)}</textarea>`:`<div class="block-text ${block.text?'':'empty'}" data-edit="${esc(block.id)}" data-placeholder="Escreva aqui…">${component??rich(block.text,seen,block.id)}</div>`}</div><div class="block-tools"><button data-proof="${esc(block.id)}" title="Revisar ortografia e gramática">Abc</button><button data-copy="${esc(block.id)}" title="Copiar referência">↗</button><button data-menu="${esc(block.id)}" title="Opções do bloco">⋯</button></div></div>${block.children.length&&!block.collapsed&&!hideChildren?`<ul class="outline children child-view-${mode}">${block.children.map(b=>blockHTML(b,scope,new Set([...seen,b.id]))).join('')}</ul>`:''}</li>`;
}
function references(page) {
  const entries=C.backlinks(data,page.title),unlinked=C.unlinkedReferences(data,page.title);
  const groups=new Map();for(const e of entries){if(!groups.has(e.page.id))groups.set(e.page.id,{page:e.page,entries:[]});groups.get(e.page.id).entries.push(e);}
  return `<details class="references" open><summary>Referências vinculadas <span>${entries.length}</span></summary><input class="reference-filter" data-reference-filter placeholder="Filtrar referências por texto…" aria-label="Filtrar referências">${[...groups.values()].map(g=>`<div class="reference-group"><a href="#p/${encodeURIComponent(g.page.id)}">${esc(g.page.title)}</a>${g.entries.map(e=>`<div class="reference-entry" data-goto="${esc(e.block.id)}"><div>${rich(e.block.text,new Set([e.block.id]),e.block.id)}</div></div>`).join('')}</div>`).join('')||'<p class="empty-state">As notas que mencionarem esta página aparecerão aqui.</p>'}</details><details class="references"><summary>Referências não vinculadas <span>${unlinked.length}</span></summary>${unlinked.map(e=>`<div class="reference-group"><a href="#p/${encodeURIComponent(e.page.id)}">${esc(e.page.title)}</a><div class="reference-entry"><div>${esc(e.block.text)}</div><button data-link-mention="${esc(e.block.id)}" data-title="${esc(page.title)}">Vincular</button></div></div>`).join('')||'<p class="empty-state">Nenhuma menção sem link encontrada.</p>'}</details>`;
}
function renderPage() {
  const page=pageById(current);if(!page)return `<section class="welcome-graph"><div class="page-eyebrow">SEU ESPAÇO PARA PENSAR</div><h1>Comece uma ideia.<br>Encontre suas conexões.</h1><p>Escreva em blocos, organize com liberdade e conecte páginas usando <code>[[links]]</code>. Suas notas ficam neste computador.</p>${automaticSync?'<p class="proof-note">A sincronização automática está configurada. Aguardando as notas do outro computador…</p>':''}<div class="welcome-actions"><button class="primary" data-action="new">Criar primeira página</button><button class="secondary" data-sync-open>Conectar outro computador</button></div><button class="welcome-examples" data-action="add-examples">Conhecer com notas de exemplo →</button><p class="proof-note">Já tem notas em outro computador? Conecte a sincronização antes de criar exemplos.</p></section>`;
  const focus=zoom?C.findBlock(data,zoom):null;
  const refEntries=focus?C.walkBlocks(data.pages).filter(e=>C.extractRefs(e.block.text).includes(focus.block.id)):[];
  return `<div class="page-eyebrow">${dateLabel(page.title)?'NOTAS DIÁRIAS':'MEU GRAFO'} <span> / </span> ${focus?'BLOCO':'PÁGINA'}</div>${focus?`<div class="zoom-crumb"><a href="#p/${encodeURIComponent(page.id)}">${esc(page.title)}</a> / Bloco</div>`:''}<div class="page-heading"><h1><button class="title-button" data-action="rename" title="Renomear página">${esc(page.title)}</button></h1><button data-action="favorite" title="Adicionar aos atalhos">${favorites.includes(page.id)?'★':'☆'}</button><button data-action="page-menu" title="Opções da página">⋯</button></div><p class="page-subtitle">${esc(dateLabel(page.title)||'Uma página, muitas conexões.')} ${focus?'· Clique no nome acima para voltar à página.':''}</p><div class="language-bar"><span>Traduzir página:</span><button data-translate-page="pt" title="Traduzir do inglês para português">Português</button><button data-translate-page="en" title="Traduzir do português para inglês">English</button><button data-writing-settings>Revisão ao digitar</button><button data-vocabulary-open>Meu vocabulário</button><button data-vocabulary-suggest>Explorar palavras</button></div><ul class="outline">${(focus?[focus.block]:page.blocks).map(b=>blockHTML(b)).join('')}</ul><button class="add-block" data-action="add-block">+ Adicionar bloco</button><p class="editor-hint"><kbd>Enter</kbd> novo bloco &nbsp; <kbd>Tab</kbd> recuar &nbsp; <kbd>[[</kbd> conectar página &nbsp; <kbd>((</kbd> referenciar bloco</p>${focus?`<details class="references" open><summary>Referências a este bloco <span>${refEntries.length}</span></summary>${refEntries.map(e=>`<div class="reference-entry" data-goto="${esc(e.block.id)}">${esc(e.page.title)} · ${esc(e.block.text)}</div>`).join('')}</details>`:references(page)}`;
}
function render() {
  rightStack=rightStack.filter(item=>pageById(item.page));
  suggestions=[]; completion=null;
  $('#breadcrumb').textContent=view==='page'?`Meu grafo / ${pageById(current)?.title||''}`:view==='graph'?'Meu grafo / Visão do grafo':view==='journals'?'Meu grafo / Diário contínuo':'Meu grafo / Todas as páginas';
  document.title=`${view==='page'?pageById(current)?.title||'Trama':view==='graph'?'Grafo':'Todas as páginas'} · Trama`;
  if(view==='page')$('#main').innerHTML=renderPage();
  else if(view==='journals')$('#main').innerHTML=renderJournals();
  else if(view==='pages')$('#main').innerHTML=`<div class="page-eyebrow">BIBLIOTECA</div><div class="page-heading"><h1>Todas as páginas</h1><button data-action="new">+</button></div><p class="page-subtitle">${data.pages.length} páginas conectadas no seu grafo.</p><input id="page-filter" class="search-input" placeholder="Filtrar páginas…" aria-label="Filtrar páginas"><div id="page-list"></div>`;
  else $('#main').innerHTML='<div class="page-eyebrow">CONEXÕES</div><div class="page-heading"><h1>Visão do grafo</h1></div><p class="page-subtitle">Cada ponto é uma página. Cada linha, uma conexão. Clique para explorar.</p><div class="graph-toolbar"><input id="graph-filter" placeholder="Filtrar conexões por página…" aria-label="Filtrar grafo"><button class="secondary" data-action="graph-reset">Limpar</button></div><svg class="graph-area" id="graph" viewBox="0 0 900 600" aria-label="Grafo de conexões"></svg><p class="empty-state" id="graph-count"></p>';
  if(view==='pages')renderPageList(); if(view==='graph')renderGraph();renderNav();renderRight();resizeEditors();bindComponents($('#main'),componentContext());renderSelection();
}
function pushRight(page,block=null){const key=block||page;rightStack=[{page,block,key},...rightStack.filter(x=>x.key!==key)];right=page;renderRight();}
function renderRight() {
  $('#right-panel').hidden=!rightStack.length;if(!rightStack.length)return;
  $('#right-panel').innerHTML=`<header><span>PAINEL LATERAL · ${rightStack.length}</span><button data-action="close-right" aria-label="Fechar painel">✕</button></header>`+rightStack.map(item=>{const p=pageById(item.page),b=item.block?C.findBlock(data,item.block)?.block:null;return `<section class="sidebar-card"><header><a href="#p/${p.id}${b?'/b/'+b.id:''}">${esc(p.title)}${b?' / Bloco':''}</a><button data-close-card="${esc(item.key)}">✕</button></header><ul class="outline">${(b?[b]:p.blocks).map(block=>blockHTML(block,'right-'+item.key)).join('')}</ul></section>`;}).join('');
  bindComponents($('#right-panel'),componentContext());
}
function renderJournals(){const pages=data.pages.filter(p=>/^\d{4}-\d{2}-\d{2}$/.test(p.title)).sort((a,b)=>b.title.localeCompare(a.title)).slice(0,14);return `<div class="page-eyebrow">NOTAS DIÁRIAS</div><div class="page-heading"><h1>Seu diário</h1><button data-feature="calendar">▦</button></div><p class="page-subtitle">As 14 notas diárias mais recentes. Use o calendário para outras datas.</p>`+pages.map(p=>`<section class="journal-page"><h2><a data-page="${esc(p.title)}" href="#">${esc(p.title)}</a></h2><p class="page-subtitle">${esc(dateLabel(p.title))}</p><ul class="outline">${p.blocks.map(b=>blockHTML(b,'journal-'+p.id)).join('')}</ul><button class="add-block" data-add-to-page="${p.id}">+ Adicionar bloco</button></section>`).join('');}
function renderSelection(){let bar=$('#selection-toolbar');if(!bar){bar=document.createElement('div');bar.id='selection-toolbar';document.body.append(bar);}bar.hidden=!selectedBlocks.size;bar.innerHTML=`<span>${selectedBlocks.size} blocos selecionados</span><button data-selection="copy">Copiar referências</button><button data-selection="indent">Recuar</button><button data-selection="outdent">Subir nível</button><button data-selection="delete">Excluir</button><button data-selection="clear">✕</button>`;}
function renderPageList(filter='') {
  const pages=data.pages.filter(p=>p.title.toLocaleLowerCase().includes(filter.toLocaleLowerCase())).sort((a,b)=>a.title.localeCompare(b.title));
  $('#page-list').innerHTML=`<table class="page-table"><thead><tr><th>Página</th><th>Blocos</th><th>Atualizada</th></tr></thead><tbody>${pages.map(p=>`<tr><td><a href="#p/${encodeURIComponent(p.id)}">${esc(p.title)}</a></td><td>${C.walkBlocks([p]).length}</td><td>${esc(new Date(p.updated).toLocaleDateString('pt-BR'))}</td></tr>`).join('')}</tbody></table>`;
}
function renderGraph(filter='') {
  let {nodes,edges}=C.graphData(data);if(filter){const ids=new Set(nodes.filter(n=>n.title.toLocaleLowerCase().includes(filter.toLocaleLowerCase())).map(n=>n.id));edges=edges.filter(e=>ids.has(e.source)||ids.has(e.target));nodes=nodes.filter(n=>ids.has(n.id)||edges.some(e=>e.source===n.id||e.target===n.id));}
  const shown=nodes.slice(0,250),ids=new Set(shown.map(n=>n.id));edges=edges.filter(e=>ids.has(e.source)&&ids.has(e.target));
  const positions=new Map(shown.map((n,i)=>{const angle=i*2.399963,r=Math.sqrt((i+.5)/Math.max(shown.length,1))*235;return[n.id,{x:450+Math.cos(angle)*r*1.5,y:300+Math.sin(angle)*r}];}));
  $('#graph').innerHTML=edges.map(e=>{const a=positions.get(e.source),b=positions.get(e.target);return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`;}).join('')+shown.map(n=>{const p=positions.get(n.id),degree=edges.filter(e=>e.source===n.id||e.target===n.id).length;return `<g tabindex="0" role="link" aria-label="${esc(n.title)}" data-page="${esc(n.title)}" transform="translate(${p.x},${p.y})"><circle r="${Math.min(5+degree*1.6,18)}"/><text text-anchor="middle" y="${24+Math.min(degree,10)}">${esc(n.title.length>25?n.title.slice(0,24)+'…':n.title)}</text></g>`;}).join('');
  $('#graph-count').textContent=`${shown.length} de ${nodes.length} páginas · ${edges.length} conexões${nodes.length>250?' · Filtre para explorar as demais páginas.':''}`;
}
document.addEventListener('trama:typography',()=>requestAnimationFrame(resizeEditors));
window.addEventListener('resize',()=>requestAnimationFrame(resizeEditors));
function resizeEditors(){document.querySelectorAll('.block-editor').forEach(el=>{el.style.height='auto';el.style.height=el.scrollHeight+'px';});}
function edit(id,scope='main',pos=null,record=true){const entry=C.findBlock(data,id);if(!entry)return; if(record&&editing?.id!==id)checkpoint();editing={id,scope};render();const el=document.querySelector(`[data-scope="${scope}"] [data-editor="${CSS.escape(id)}"]`);if(el){el.focus();const at=pos===null?el.value.length:pos;el.setSelectionRange(at,at);resizeEditors();}}
function structure(id,fn,pos=null){checkpoint();const pageId=C.findBlock(data,id)?.page.id;fn();changed(pageId);edit(id,editing?.scope||'main',pos);}

function complete(el) {
  document.querySelectorAll('.suggestions').forEach(e=>e.remove());suggestions=[];completion=null;
  const before=el.value.slice(0,el.selectionStart),m=before.match(/(\[\[|\(\()([^\[\]()\n]*)$/);
  if(!m){
    const slash=before.match(/(?:^|\s)\/([\p{L}-]*)$/u),template=before.match(/;;([^;\n]*)$/);
    if(slash){suggestions=commands.filter(c=>c.label.toLocaleLowerCase().includes(slash[1].toLocaleLowerCase())).slice(0,12);completion={start:before.length-slash[1].length-1,end:el.selectionStart,type:'command'};}
    else if(template){suggestions=C.listTemplates(data).filter(t=>t.label.toLocaleLowerCase().includes(template[1].toLocaleLowerCase())).slice(0,10).map(t=>({label:t.label,command:'template:'+t.id}));completion={start:template.index,end:el.selectionStart,type:'command'};}
    if(!suggestions.length)return;suggestionIndex=0;const box=document.createElement('div');box.className='suggestions';box.innerHTML=suggestions.map((s,i)=>`<button data-suggestion="${i}" class="${i===0?'selected':''}">${esc(s.label)}</button>`).join('');el.parentElement.append(box);return;
  } const type=m[1]==='[['?'page':'block',query=m[2].toLocaleLowerCase();
  suggestions=type==='page'?data.pages.filter(p=>p.title.toLocaleLowerCase().includes(query)).slice(0,7).map(p=>({label:p.title,value:p.title})):C.walkBlocks(data.pages).filter(e=>e.block.id!==editing.id&&e.block.text.toLocaleLowerCase().includes(query)).slice(0,7).map(e=>({label:`${e.block.text||'(vazio)'} · ${e.page.title}`,value:e.block.id}));
  if(type==='page'&&m[2].trim()&&!C.findPage(data,m[2].trim()))suggestions.push({label:`Criar “${m[2].trim()}”`,value:m[2].trim()});
  if(!suggestions.length)return;completion={start:m.index,end:el.selectionStart,type};suggestionIndex=0;
  const box=document.createElement('div');box.className='suggestions';box.innerHTML=suggestions.map((s,i)=>`<button data-suggestion="${i}" class="${i===0?'selected':''}">${esc(s.label)}</button>`).join('');el.parentElement.append(box);
}
function acceptSuggestion(index) {
  const el=document.querySelector('.block-editor:focus')||document.querySelector('.block-editor'),s=suggestions[index];if(!el||!s||!completion)return;
  if(completion.type==='command'){const id=editing.id,entry=C.findBlock(data,id);entry.block.text=el.value.slice(0,completion.start)+el.value.slice(completion.end);changed(entry.page.id);suggestions=[];completion=null;F.execute(s.command,id);return;}
  const {start,end,type}=completion,close=type==='page'?']]':'))',value=(type==='page'?'[[':'((')+s.value+close;
  const skip=el.value.slice(end,end+2)===close?2:0;
  el.value=el.value.slice(0,start)+value+el.value.slice(end+skip);const pos=start+value.length;
  const entry=C.findBlock(data,editing.id);entry.block.text=el.value;changed(entry.page.id);el.focus();el.setSelectionRange(pos,pos);document.querySelectorAll('.suggestions').forEach(e=>e.remove());suggestions=[];completion=null;resizeEditors();
}
document.addEventListener('input',e=>{
  if(e.target.matches('.block-editor')){const entry=C.findBlock(data,e.target.dataset.editor);entry.block.text=e.target.value;changed(entry.page.id);resizeEditors();complete(e.target);}
  if(e.target.id==='search-input')searchResults(e.target.value);
  if(e.target.id==='page-filter')renderPageList(e.target.value);
  if(e.target.id==='graph-filter')renderGraph(e.target.value);
  if(e.target.matches('[data-reference-filter]')){const q=e.target.value.toLocaleLowerCase();e.target.closest('details').querySelectorAll('.reference-group').forEach(g=>g.hidden=!g.textContent.toLocaleLowerCase().includes(q));}
});
document.addEventListener('focusout',e=>{if(e.target.matches('.block-editor')){const old=editing;setTimeout(()=>{if(editing===old&&!document.activeElement?.matches('.block-editor')&&!document.activeElement?.closest('.suggestions')&&!$('#modal').open&&!document.querySelector('#dictionary-dialog[open]')){editing=null;render();}},160);}});
document.addEventListener('keydown',e=>{
  const mod=e.ctrlKey||e.metaKey;
  if(mod&&['k','u'].includes(e.key.toLowerCase())){e.preventDefault();search();return;}
  if(mod&&e.altKey&&e.key.toLowerCase()==='l'){e.preventDefault();openProofreader();return;}
  if(mod&&e.key==='s'){e.preventDefault();save();return;}
  if(mod&&e.key.toLowerCase()==='z'&&!e.target.isContentEditable&&!e.target.closest('input,textarea,select')){e.preventDefault();historyStep(e.shiftKey);return;}
  if(e.target.closest('[data-ref]')&&e.key==='Enter'){e.preventDefault();openBlock(e.target.closest('[data-ref]').dataset.ref,e.shiftKey);return;}
  if(e.target.closest('#graph')&&e.key==='Enter'){e.preventDefault();openPage(e.target.closest('[data-page]').dataset.page);return;}
  if(!e.target.matches('.block-editor')||e.isComposing)return;
  if(!editing)editing={id:e.target.dataset.editor,scope:e.target.closest('[data-scope]').dataset.scope};
  const el=e.target,entry=C.findBlock(data,el.dataset.editor),id=entry.block.id,pos=el.selectionStart;
  if(completion&&suggestions.length&&['ArrowDown','ArrowUp','Enter','Tab'].includes(e.key)) {
    e.preventDefault();if(e.key==='Enter'||e.key==='Tab')acceptSuggestion(suggestionIndex);
    else {suggestionIndex=(suggestionIndex+(e.key==='ArrowDown'?1:-1)+suggestions.length)%suggestions.length;document.querySelectorAll('[data-suggestion]').forEach((b,i)=>b.classList.toggle('selected',i===suggestionIndex));}return;
  }
  if(mod&&['b','i','h'].includes(e.key.toLowerCase())){e.preventDefault();const mark={b:'**',i:'__',h:'^^'}[e.key.toLowerCase()],end=el.selectionEnd;checkpoint();entry.block.text=el.value.slice(0,pos)+mark+el.value.slice(pos,end)+mark+el.value.slice(end);changed(entry.page.id);edit(id,editing.scope,pos+mark.length,false);return;}
  if(e.key==='Escape'){e.preventDefault();editing=null;suggestions=[];completion=null;render();return;}
  if(e.key==='Tab'){e.preventDefault();structure(id,()=>e.shiftKey?C.outdentBlock(data,id):C.indentBlock(data,id),pos);return;}
  if(mod&&e.key==='Enter'){e.preventDefault();structure(id,()=>{entry.block.text=/\{\{(?:\[\[)?TODO/.test(entry.block.text)?entry.block.text.replace(/\{\{(?:\[\[)?TODO(?:\]\])?\}\}/,'{{[[DONE]]}}'):/\{\{(?:\[\[)?DONE/.test(entry.block.text)?entry.block.text.replace(/\{\{(?:\[\[)?DONE(?:\]\])?\}\}/,'{{[[TODO]]}}'):'{{[[TODO]]}} '+entry.block.text;});return;}
  if(mod&&e.shiftKey&&['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();structure(id,()=>C.moveBlock(data,id,e.key==='ArrowUp'?-1:1),pos);return;}
  if(e.key==='Enter'&&!e.shiftKey){
    e.preventDefault();checkpoint();
    if(!el.value&&entry.parent){C.outdentBlock(data,id);changed(entry.page.id);edit(id,editing.scope,0);return;}
    const next=C.newBlock(el.value.slice(el.selectionEnd));entry.block.text=el.value.slice(0,pos);
    if(entry.block.children.length&&!entry.block.collapsed)entry.block.children.unshift(next);else entry.siblings.splice(entry.index+1,0,next);
    changed(entry.page.id);edit(next.id,editing.scope,0,false);return;
  }
  if(e.key==='Backspace'&&pos===0&&el.selectionEnd===0){
    if(!entry.block.text){e.preventDefault();checkpoint();const list=[...document.querySelectorAll(`[data-scope="${editing.scope}"] [data-edit], [data-scope="${editing.scope}"] [data-editor]`)],at=list.indexOf(el),previous=list[at-1];
      if(entry.block.children.length){entry.siblings.splice(entry.index,1,...entry.block.children);}
      else C.removeBlock(data,id);changed(entry.page.id);const target=previous?.dataset.edit||previous?.dataset.editor||entry.page.blocks[0]?.id;editing=null;render();if(target)edit(target,el.closest('[data-scope]')?.dataset.scope||'main');return;
    }
    if(entry.index>0){const prev=entry.siblings[entry.index-1];if(!prev.children.length){e.preventDefault();checkpoint();const cursor=prev.text.length;prev.text+=entry.block.text;prev.children=entry.block.children;entry.siblings.splice(entry.index,1);changed(entry.page.id);edit(prev.id,editing.scope,cursor);return;}}
  }
  if(['ArrowUp','ArrowDown'].includes(e.key)&&!e.shiftKey&&((e.key==='ArrowUp'&&pos===0)||(e.key==='ArrowDown'&&pos===el.value.length))) {
    const scope=editing.scope,list=[...document.querySelectorAll(`[data-scope="${scope}"] [data-edit], [data-scope="${scope}"] [data-editor]`)],at=list.indexOf(el),target=list[at+(e.key==='ArrowUp'?-1:1)];if(target){e.preventDefault();edit(target.dataset.edit||target.dataset.editor,scope,e.key==='ArrowDown'?0:null);}
  }
});
function historyStep(forward) {const source=forward?redo:undo,target=forward?undo:redo;if(!source.length){toast('Nenhuma alteração para '+(forward?'refazer.':'desfazer.'));return;}target.push(JSON.stringify(data));data=JSON.parse(source.pop());editing=null;current=pageById(current)?.id||data.pages[0]?.id; if(zoom&&!C.findBlock(data,zoom))zoom=null;if(right&&!pageById(right))right=null;history.replaceState(null,'',current?'#p/'+encodeURIComponent(current):'#pages');if(!current)view='pages';changed();render();}

function modal(title,body) {$('#modal-content').innerHTML=`<div class="modal-head"><h2>${esc(title)}</h2><button data-action="close-modal" aria-label="Fechar">✕</button></div><div class="modal-body">${body}</div>`;if(!$('#modal').open)$('#modal').showModal();}
function nameDialog(rename=false) {
  modal(rename?'Renomear página':'Nova página',`<form id="name-form"><label for="page-name">Nome da página</label><input type="text" id="page-name" maxlength="500" required value="${rename?esc(pageById(current)?.title):''}" autocomplete="off"><p class="empty-state">${rename?'Os links existentes serão atualizados junto com o nome.':'Use [[Nome da página]] em qualquer bloco para conectar suas notas.'}</p><div class="modal-actions"><button type="button" class="secondary" data-action="close-modal">Cancelar</button><button class="primary" type="submit">${rename?'Renomear':'Criar página'}</button></div></form>`);
  $('#page-name').focus();$('#page-name').select();$('#name-form').onsubmit=e=>{e.preventDefault();try{checkpoint();const title=$('#page-name').value.trim();if(rename){C.renamePage(data,current,title);changed(current);render();}else openPage(title);$('#modal').close();}catch(err){toast(err.message);}};
}
function search() {editing=null;render();$('#modal-content').innerHTML='<input class="search-input" id="search-input" aria-label="Buscar ou criar página" placeholder="Buscar ou criar página…" autocomplete="off"><div class="search-results" id="search-results"></div><div class="search-footer">Enter abre o primeiro resultado · Esc fecha · Shift+clique abre no painel lateral</div>';if(!$('#modal').open)$('#modal').showModal();$('#search-input').focus();searchResults('');$('#search-input').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('#search-results button')?.click();}};}
function searchResults(value) {const q=value.trim().toLocaleLowerCase();let pages=data.pages.filter(p=>p.title.toLocaleLowerCase().includes(q)).slice(0,12);const blocks=q?C.walkBlocks(data.pages).filter(e=>e.block.text.toLocaleLowerCase().includes(q)).slice(0,20):[];$('#search-results').innerHTML=pages.map(p=>`<button class="search-result" data-search-page="${esc(p.title)}">▤ &nbsp;${esc(p.title)}</button>`).join('')+blocks.map(e=>`<button class="search-result" data-search-block="${esc(e.block.id)}">• &nbsp;${esc(e.block.text.slice(0,180))}<small>${esc(e.page.title)}</small></button>`).join('')+(value.trim()&&!C.findPage(data,value.trim())?`<button class="search-result" data-search-page="${esc(value.trim())}">+ Criar página “${esc(value.trim())}”</button>`:'');}
function download(name,content,type='application/json') {const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
function appearance() {
  const preference=document.documentElement.dataset.themePreference||'light';
  const textSize=Number(document.documentElement.dataset.textSize)||100;
  modal('Aparência',`<p>Escolha o tema mais confortável para você. É possível mudar a qualquer momento.</p><label class="theme-settings">Tema<select data-theme-select aria-label="Tema da aparência">${[['light','Claro'],['dark','Escuro'],['system','Seguir o sistema']].map(([value,label])=>`<option value="${value}" ${preference===value?'selected':''}>${label}</option>`).join('')}</select></label><p class="proof-note">Em “Seguir o sistema”, a aparência acompanha o tema do seu computador. A escolha fica salva neste navegador.</p><p data-theme-status role="status">${preference==='system'?'Seguindo o sistema':preference==='dark'?'Tema escuro selecionado':'Tema claro selecionado'}</p><fieldset class="text-size-settings"><legend>Tamanho do texto</legend><p>Aumente ou diminua as letras das notas, menus e ferramentas. A mudança aparece na hora.</p><label for="text-size-slider">Tamanho das letras</label><input id="text-size-slider" data-text-size type="range" min="80" max="200" step="10" value="${textSize}"><div class="text-size-controls"><button type="button" data-text-size-step="-10" aria-label="Diminuir tamanho do texto" ${textSize<=80?'disabled':''}>A−</button><output for="text-size-slider" data-text-size-value aria-live="polite">${textSize}%</output><button type="button" data-text-size-step="10" aria-label="Aumentar tamanho do texto" ${textSize>=200?'disabled':''}>A+</button><button type="button" data-text-size-reset>Restaurar padrão</button></div><div class="text-size-preview"><p>Suas ideias merecem espaço para crescer.</p><p>Your ideas deserve room to grow.</p></div><p class="proof-note">A preferência fica salva neste navegador, sem alterar suas notas. Cada computador pode usar seu próprio tamanho.</p></fieldset>`);
}
function settings() {modal('Dados locais e backups',`<p>As notas são gravadas em SQLite neste computador. A conexão ao Proton Drive é opcional e pode ser ativada em Sincronização.</p><div class="settings-row"><button class="primary" data-full-backup-open>Backup completo e restauração guiada</button><button class="secondary" data-action="export">Exportar JSON</button><button class="secondary" data-action="markdown">Exportar Markdown</button><button class="secondary" data-feature="export-roam">Exportar formato Roam</button><a class="secondary" href="/api/vault.zip" download>Exportar grafo completo + anexos</a><button class="secondary" data-feature="vault-import">Restaurar grafo completo</button><button class="secondary" data-feature="history">Histórico de versões</button><button class="secondary" data-action="backup">Criar backup SQLite</button></div><p>Importe um arquivo JSON exportado pelo Roam ou pelo Trama. A importação substitui o grafo atual após confirmação e backup.</p><div class="settings-row"><button class="secondary" data-action="import">Importar JSON</button><button class="secondary" data-action="import-markdown">Importar Markdown</button><button class="secondary" data-action="theme">Aparência</button></div>${dirty?`<div class="error-banner">Há alterações ainda não salvas. ${conflict?'Outra janela modificou o grafo. Exporte o JSON desta janela antes de recarregar.':'Mantenha esta janela aberta e tente salvar novamente.'}</div><div class="settings-row"><button class="primary" data-action="retry">Tentar salvar</button><button class="secondary" data-action="reload">Recarregar do disco</button></div>`:''}<p class="empty-state">Backups automáticos a cada inicialização; os 20 mais recentes ficam na pasta backups, ao lado do banco. Use JSON para transportar seu grafo com os IDs preservados.</p>`);}
function help() {modal('Um guia para pensar em blocos',`<p>O Trama reproduz o núcleo de notas conectadas do Roam. Cada tópico é um bloco com identidade própria.</p><ul><li><kbd>Enter</kbd> cria um bloco; <kbd>Shift Enter</kbd> cria uma linha no mesmo bloco.</li><li><kbd>Tab</kbd> recua; <kbd>Shift Tab</kbd> volta um nível.</li><li><kbd>Ctrl Shift ↑ / ↓</kbd> move um bloco entre irmãos.</li><li>Arraste o ponto do bloco sobre outro para movê-lo. Segure Shift para colocá-lo como filho.</li><li><code>[[Página]]</code> e <code>#tag</code> criam links com backlinks.</li><li><code>((id))</code> exibe uma referência viva. O menu ⋯ copia o ID.</li><li><code>{{embed: ((id))}}</code> incorpora o bloco e seus filhos. O link acima leva à edição do original.</li><li>Shift+clique abre links no painel lateral.</li><li><kbd>Ctrl Enter</kbd> alterna tarefa TODO/DONE.</li><li><kbd>Ctrl K</kbd> ou <kbd>Ctrl U</kbd> busca páginas e blocos.</li><li>Fora do campo de edição, <kbd>Ctrl Z</kbd> desfaz; <kbd>Ctrl Shift Z</kbd> refaz. Dentro dele, vale o desfazer do navegador.</li><li><code>{{query: [[Página]] #tag palavra}}</code> mostra blocos que atendem a todos os termos. Também suporta {and:}, {or:}, {not:}, {search:}, {between:} e {daily-notes:}. Consultas Datalog rodam localmente com <code>{{datalog: [:find ?title :where [?p :node/title ?title]]}}</code>; o construtor de consultas mostra os campos disponíveis.</li></ul><p>Também há **negrito**, <code>código</code> e [texto](https://endereço) nos blocos. Clique no título para renomear a página e atualizar os links.</p>`);}
async function copy(text) {try{await navigator.clipboard.writeText(text);toast('Copiado.');}catch{modal('Copiar referência',`<input type="text" id="copy-value" readonly value="${esc(text)}"><p>Selecione e copie com Ctrl+C.</p>`);$('#copy-value').select();}}
function legacyBlockMenu(id) {modal('Opções do bloco',`<div class="settings-row"><button class="secondary" data-proof="${esc(id)}">Revisar ortografia e gramática</button><button class="secondary" data-copy="${esc(id)}">Copiar referência</button><button class="secondary" data-embed-copy="${esc(id)}">Copiar incorporação</button><button class="secondary" data-duplicate="${esc(id)}">Duplicar bloco</button><button class="secondary danger" data-delete-block="${esc(id)}">Excluir bloco e filhos</button></div><p class="empty-state">As referências mostram sempre o conteúdo atual do bloco original. Excluir o original deixa suas referências marcadas como ausentes.</p>`);}
async function backup() {if(!await flush())throw Error('Salve as alterações pendentes antes de criar o backup.');const res=await fetch('/api/backup',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});const out=await res.json();if(!res.ok)throw Error(out.error);toast('Backup criado.');return out.path;}

const actions={
  'add-examples':()=>{if(data.pages.length){toast('Os exemplos só são criados em um grafo vazio.');return;}checkpoint();seed();current=data.pages[0]?.id;view='page';history.replaceState(null,'','#p/'+current);render();},
  journals:()=>location.hash='journals',proofread:()=>openProofreader(),daily:()=>openPage(todayTitle()),graph:()=>location.hash='graph',pages:()=>location.hash='pages',search,new:()=>nameDialog(),rename:()=>nameDialog(true),help,settings,
  'toggle-nav':()=>document.body.classList.toggle('mobile-hidden'),back:()=>history.back(),'close-right':()=>{right=null;rightStack=[];renderRight();},'close-modal':()=>$('#modal').close(),
  favorite:()=>{favorites=favorites.includes(current)?favorites.filter(id=>id!==current):[...favorites,current];persistUI();render();},
  'add-block':()=>{checkpoint();const b=C.newBlock(),entry=zoom?C.findBlock(data,zoom):null;if(entry){entry.block.children.push(b);entry.block.collapsed=false;}else pageById(current).blocks.push(b);changed(current);edit(b.id,'main',null,false);},
  'page-menu':()=>modal('Opções da página',`<div class="settings-row"><button class="secondary" data-action="rename">Renomear</button><button class="secondary" data-action="sidebar-page">Abrir no painel</button><button class="secondary" data-action="collapse-all">Recolher todos</button><button class="secondary" data-action="expand-all">Expandir todos</button><button class="secondary danger" data-action="delete-page">Excluir página</button></div>`),
  'sidebar-page':()=>{pushRight(current);$('#modal').close();},
  'collapse-all':()=>{checkpoint();C.walkBlocks([pageById(current)]).forEach(e=>e.block.collapsed=true);changed(current);render();$('#modal').close();},
  'expand-all':()=>{checkpoint();C.walkBlocks([pageById(current)]).forEach(e=>e.block.collapsed=false);changed(current);render();$('#modal').close();},
  'delete-page':()=>modal('Excluir página?',`<p>Excluir “${esc(pageById(current).title)}” e todos os seus blocos? Referências a blocos excluídos ficarão ausentes. Links de página poderão recriá-la vazia.</p><div class="modal-actions"><button class="secondary" data-action="close-modal">Cancelar</button><button class="primary" data-action="confirm-delete-page">Excluir página</button></div>`),
  'confirm-delete-page':()=>{checkpoint();data.pages=data.pages.filter(p=>p.id!==current);changed();$('#modal').close();openPage(todayTitle());},
  'export-roam':()=>download(`trama-roam-${todayTitle()}.json`,JSON.stringify(C.exportRoam(data),null,2)),export:()=>download(`trama-${todayTitle()}.json`,JSON.stringify(data,null,2)),markdown:()=>download(`trama-${todayTitle()}.md`,C.exportMarkdown(data),'text/markdown;charset=utf-8'),
  backup:async()=>{const path=await backup();modal('Backup criado',`<p>Banco copiado com segurança para:</p><p><code>${esc(path)}</code></p>`);},
  'import-markdown':()=>$('#markdown-input').click(),import:()=>$('#import-file').click(),theme:appearance,
  retry:async()=>{if(conflict){toast('Exporte suas alterações e recarregue para resolver o conflito.');return;}await save();settings();},
  reload:()=>modal('Recarregar do disco?',`<p>As alterações não salvas desta janela serão descartadas. Exporte o JSON antes, se quiser preservá-las.</p><div class="modal-actions"><button class="secondary" data-action="export">Exportar JSON desta janela</button><button class="primary" data-action="confirm-reload">Recarregar</button></div>`),
  'confirm-reload':()=>{dirty=false;location.reload();},'graph-reset':()=>{$('#graph-filter').value='';renderGraph();}
};
document.addEventListener('pointerdown',e=>{if(e.target.closest('[data-suggestion]'))e.preventDefault();});
document.addEventListener('click',async e=>{
  try {
    const t=e.target;
    if(t.closest('[data-command],[data-feature],[data-sync-open]'))return;
    const closeCard=t.closest('[data-close-card]');if(closeCard){rightStack=rightStack.filter(x=>x.key!==closeCard.dataset.closeCard);renderRight();return;}
    const extra=t.closest('[data-add-to-page]');if(extra){checkpoint();const p=pageById(extra.dataset.addToPage),b=C.newBlock();p.blocks.push(b);changed(p.id);edit(b.id,'journal-'+p.id,null,false);return;}
    const queryEdit=t.closest('[data-query-builder]');if(queryEdit){F.execute('query',queryEdit.dataset.queryBuilder);return;}
    const queryGroup=t.closest('[data-query-group]');if(queryGroup){const id=queryGroup.dataset.queryGroup,o=queryOptions.get(id)||{};o.group=o.group===false;queryOptions.set(id,o);render();return;}
    const querySort=t.closest('[data-query-sort]');if(querySort){const id=querySort.dataset.querySort,o=queryOptions.get(id)||{};o.sort=o.sort==='text'?'page':'text';queryOptions.set(id,o);render();return;}
    if(t.closest('[data-query-refresh]')){render();return;}
    const result=t.closest('[data-result-edit]');if(result){componentEdit(result.dataset.resultEdit);return;}
    const templateButton=t.closest('[data-template-button]');if(templateButton){F.execute('template:'+templateButton.dataset.templateButton,templateButton.dataset.templateTarget);return;}
    const selection=t.closest('[data-selection]');if(selection){const ids=[...selectedBlocks].filter(id=>{let p=C.findBlock(data,id)?.parent;while(p){if(selectedBlocks.has(p.id))return false;p=C.findBlock(data,p.id)?.parent;}return true;}),action=selection.dataset.selection;if(action==='copy')await copy(ids.map(id=>`((${id}))`).join('\n'));else if(action!=='clear'){checkpoint();for(const id of action==='outdent'?[...ids].reverse():ids){const entry=C.findBlock(data,id);if(!entry)continue;if(action==='delete')C.removeBlock(data,id);else if(action==='indent')C.indentBlock(data,id);else C.outdentBlock(data,id);changed(entry.page.id);}}selectedBlocks.clear();render();return;}

    const suggest=t.closest('[data-suggestion]');if(suggest){acceptSuggestion(Number(suggest.dataset.suggestion));return;}
    const task=t.closest('[data-task]');if(task){const entry=C.findBlock(data,task.dataset.task);if(entry){checkpoint();const offset=Number(task.dataset.taskOffset),match=entry.block.text.slice(offset).match(/^\{\{(?:\[\[)?(?:TODO|DONE)(?:\]\])?\}\}/);if(match)entry.block.text=entry.block.text.slice(0,offset)+(task.checked?'{{[[DONE]]}}':'{{[[TODO]]}}')+entry.block.text.slice(offset+match[0].length);changed(entry.page.id);render();}return;}
    const page=t.closest('[data-page]');if(page){e.preventDefault();openPage(page.dataset.page,e.shiftKey);return;}
    const ref=t.closest('[data-ref]');if(ref){e.preventDefault();openBlock(ref.dataset.ref,e.shiftKey);return;}
    const action=t.closest('[data-action]');if(action){await actions[action.dataset.action]?.();return;}
    const sp=t.closest('[data-search-page]');if(sp){$('#modal').close();openPage(sp.dataset.searchPage,e.shiftKey);return;}
    const sb=t.closest('[data-search-block]');if(sb){$('#modal').close();openBlock(sb.dataset.searchBlock,e.shiftKey);return;}
    const collapse=t.closest('[data-collapse]');if(collapse){const entry=C.findBlock(data,collapse.dataset.collapse);checkpoint();entry.block.collapsed=!entry.block.collapsed;changed(entry.page.id);render();return;}
    const z=t.closest('[data-zoom]');if(z){if(e.shiftKey){selectedBlocks.has(z.dataset.zoom)?selectedBlocks.delete(z.dataset.zoom):selectedBlocks.add(z.dataset.zoom);render();}else openBlock(z.dataset.zoom);return;}
    const proof=t.closest('[data-proof]');if(proof){openProofreader(proof.dataset.proof);return;}
    const cp=t.closest('[data-copy]');if(cp){await copy(`((${cp.dataset.copy}))`);return;}
    const ec=t.closest('[data-embed-copy]');if(ec){await copy(`{{embed: ((${ec.dataset.embedCopy}))}}`);return;}
    const menu=t.closest('[data-menu]');if(menu){F.blockMenu(menu.dataset.menu);return;}
    const del=t.closest('[data-delete-block]');if(del){checkpoint();const entry=C.findBlock(data,del.dataset.deleteBlock);C.removeBlock(data,entry.block.id);changed(entry.page.id);editing=null;render();$('#modal').close();return;}
    const dupe=t.closest('[data-duplicate]');if(dupe){checkpoint();const entry=C.findBlock(data,dupe.dataset.duplicate),clone=b=>({...b,id:C.uid(),children:b.children.map(clone)});entry.siblings.splice(entry.index+1,0,clone(entry.block));changed(entry.page.id);render();$('#modal').close();return;}
    const mention=t.closest('[data-link-mention]');if(mention){checkpoint();const entry=C.findBlock(data,mention.dataset.linkMention),title=mention.dataset.title,index=C.unlinkedMentionIndex(entry.block.text,title);if(index>=0)entry.block.text=entry.block.text.slice(0,index)+`[[${title}]]`+entry.block.text.slice(index+title.length);changed(entry.page.id);render();return;}
    const go=t.closest('[data-goto]');if(go&&!t.closest('a')){openBlock(go.dataset.goto,e.shiftKey);return;}
    const editTarget=t.closest('[data-edit]');if(editTarget&&!t.closest('a,input,select,button,textarea,video,audio,iframe,.trama-component'))edit(editTarget.dataset.edit,editTarget.closest('[data-scope]').dataset.scope);
  }catch(err){toast(err.message);}
});
let dragged=null;
document.addEventListener('dragstart',e=>{const dot=e.target.closest('[data-zoom]');if(!dot)return;dragged=dot.dataset.zoom;e.dataTransfer.setData('text/plain',`((${dragged}))`);e.dataTransfer.effectAllowed='move';});
document.addEventListener('dragover',e=>{if(!dragged)return;const line=e.target.closest('.block-line');if(line){e.preventDefault();document.querySelectorAll('.drag-target').forEach(el=>el.classList.remove('drag-target'));line.classList.add('drag-target');}});
document.addEventListener('dragend',()=>{dragged=null;document.querySelectorAll('.drag-target').forEach(el=>el.classList.remove('drag-target'));});
document.addEventListener('drop',e=>{if(!dragged)return;const target=e.target.closest('[data-id]');if(!target)return;e.preventDefault();const source=C.findBlock(data,dragged),dest=C.findBlock(data,target.dataset.id);if(!source||!dest||source.block.id===dest.block.id)return;const descendant=(b,id)=>b.id===id||b.children.some(c=>descendant(c,id));if(descendant(source.block,dest.block.id)){toast('Um bloco não pode ser movido para dentro de si mesmo.');return;}checkpoint();source.siblings.splice(source.index,1);if(e.shiftKey){dest.block.children.push(source.block);dest.block.collapsed=false;}else{const updated=C.findBlock(data,dest.block.id);updated.siblings.splice(updated.index+1,0,source.block);}if(!source.page.blocks.length)source.page.blocks.push(C.newBlock());changed(source.page.id);changed(dest.page.id);editing=null;dragged=null;render();});
$('#import-file').addEventListener('change',async e=>{
  const file=e.target.files[0];e.target.value='';if(!file)return;
  try {if(file.size>30*1024*1024)throw Error('O arquivo excede 30 MB.');const imported=C.importData(JSON.parse(await file.text()));
    modal('Substituir o grafo atual?',`<p>Importar <strong>${imported.pages.length} páginas</strong> de “${esc(file.name)}”? Um backup SQLite será criado antes de substituir suas notas.</p><div class="modal-actions"><button class="secondary" data-action="close-modal">Cancelar</button><button class="secondary" id="merge-import">Mesclar com este grafo</button><button class="primary" id="confirm-import">Criar backup e substituir</button></div>`);
    $('#merge-import').onclick=async()=>{try{await backup();checkpoint();C.mergeGraph(data,imported);changed();render();await flush();$('#modal').close();toast('Páginas mescladas com IDs preservados ou remapeados.');}catch(error){toast(error.message);}};
    $('#confirm-import').onclick=async()=>{try{$('#confirm-import').disabled=true;await backup();checkpoint();data=imported;materialize();current=data.pages[0]?.id;right=null;editing=null;zoom=null;view=current?'page':'pages';render();changed();await flush();if(dirty)throw Error('Importação está na memória, mas não foi salva. Exporte o JSON e confira o aviso de gravação.');current=data.pages[0]?.id;right=null;editing=null;$('#modal').close();location.hash=`p/${encodeURIComponent(current||'')}`;route();toast('Grafo importado.');}catch(err){toast(err.message);if($('#confirm-import'))$('#confirm-import').disabled=false;}};
  }catch(err){toast('Não foi possível importar: '+err.message);}
});

document.addEventListener('paste',event=>{
  const el=event.target;if(!el.matches?.('.block-editor'))return;const text=event.clipboardData?.getData('text/plain');
  if(!text?.includes('\n')||el.value.trimStart().startsWith('```'))return;event.preventDefault();const entry=C.findBlock(data,el.dataset.editor);if(!entry)return;
  const before=el.value.slice(0,el.selectionStart),after=el.value.slice(el.selectionEnd),blocks=parseOutline(text),first=blocks.shift();checkpoint();
  entry.block.text=before+first.text;entry.block.children.push(...first.children);entry.siblings.splice(entry.index+1,0,...blocks);const last=blocks.at(-1)||entry.block;last.text+=after;changed(entry.page.id);edit(last.id,editing?.scope||'main',last.text.length-after.length,false);
});
const markdownInput=document.createElement('input');markdownInput.type='file';markdownInput.id='markdown-input';markdownInput.accept='.md,.markdown,.txt';markdownInput.multiple=true;markdownInput.hidden=true;document.body.append(markdownInput);
markdownInput.onchange=async()=>{const files=[...markdownInput.files];markdownInput.value='';if(!files.length)return;try{let size=0;const pages=[];for(const f of files){size+=f.size;if(size>20*1024*1024)throw Error('Limite total de 20 MB na importação Markdown.');pages.push(...markdownPages(f.name,await f.text()));}const incoming=C.importData({version:1,pages});await backup();checkpoint();C.mergeGraph(data,incoming);changed();render();await flush();$('#modal').close();toast(`${pages.length} páginas Markdown importadas.`);}catch(error){toast(error.message);}};

function openProofreader(id=editing?.id) {
  const entries=C.walkBlocks(data.pages).filter(e=>e.page.id===(C.findBlock(data,id)?.page.id||current)&&e.block.text.trim());
  proofTarget=entries.some(e=>e.block.id===id)?id:entries[0]?.block.id;proofRequest++;proofMatches=[];
  modal('Ortografia e gramática',`<p>Revisão em português e inglês com o LanguageTool local. Suas notas ficam neste computador.</p><div class="proof-controls"><label>Idioma<select id="proof-language"><option value="pt-BR">Português · Brasil</option><option value="pt-PT">Português · Portugal</option><option value="en-US">English · United States</option><option value="en-GB">English · United Kingdom</option></select></label><label>Bloco a revisar<select id="proof-block">${entries.map(e=>`<option value="${esc(e.block.id)}">${esc(e.block.text.slice(0,85))}</option>`).join('')}</select></label></div><p class="proof-note">Links, referências, tags e código são preservados. Cada sugestão só é aplicada quando você a aceita.</p><button class="primary" id="proof-run" ${entries.length?'':'disabled'}>Revisar texto</button><div id="proof-results" aria-live="polite">${entries.length?'':'<p>Escreva um bloco para começar.</p>'}</div><details class="proof-setup"><summary>Como ativar o corretor local</summary><p><strong>Arch Linux:</strong> instale o pacote oficial uma vez:</p><pre><code>sudo pacman -S --needed languagetool</code></pre><p><strong>Windows:</strong> instale Java e a distribuição standalone do servidor LanguageTool. Defina a variável TRAMA_LANGUAGETOOL_DIR com a pasta que contém languagetool-server.jar; o README inclui as instruções.</p><p>Reinicie o Trama. O serviço será iniciado automaticamente ao revisar. A primeira análise pode levar alguns segundos. A ortografia em português e inglês já funciona ao digitar com os dicionários incluídos no Trama. O LanguageTool acrescenta sugestões de gramática e estilo.</p></details>`);
  $('#proof-language').value=proofLanguage;$('#proof-block').value=proofTarget||'';
  $('#proof-language').onchange=()=>{proofLanguage=$('#proof-language').value;try{localStorage.setItem('trama-proof-language',proofLanguage);}catch{}document.querySelectorAll('.block-editor').forEach(el=>el.lang=proofLanguage);proofRequest++;$('#proof-results').innerHTML='';};
  $('#proof-block').onchange=()=>{proofTarget=$('#proof-block').value;proofRequest++;$('#proof-results').innerHTML='';};
  $('#proof-run').onclick=runProofread;
}
async function runProofread() {
  proofTarget=$('#proof-block')?.value;const entry=C.findBlock(data,proofTarget);if(!entry)return;
  const snapshot=entry.block.text,request=++proofRequest,language=$('#proof-language').value,target=entry.block.id;
  if(snapshot.length>20000){$('#proof-results').innerHTML='<p class="error-banner">Divida este texto em blocos menores. O limite é de 20 mil caracteres por revisão.</p>';return;}
  $('#proof-run').disabled=true;$('#proof-results').innerHTML='<p class="proof-note">Analisando com o corretor local… A primeira execução inicia o LanguageTool.</p>';
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);
  try {
    const masked=maskMarkup(snapshot);
    const res=await fetch('/api/proofread',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:masked,language}),signal:controller.signal});
    const out=await res.json();if(!res.ok)throw Error(out.error||'Não foi possível consultar o corretor local.');
    if(request!==proofRequest||!$('#proof-results'))return;
    if(C.findBlock(data,target)?.block.text!==snapshot)throw Error('O bloco mudou durante a revisão. Clique em Revisar texto novamente.');
    proofSnapshot=snapshot;proofMatches=(out.matches||[]).filter(m=>Number.isInteger(m.offset)&&Number.isInteger(m.length)&&m.length>=0&&!isProtectedRange(snapshot,m.offset,m.length));
    $('#proof-results').innerHTML=proofMatches.length?`<p class="proof-count">${proofMatches.length} ${proofMatches.length===1?'sugestão encontrada':'sugestões encontradas'}</p>`+proofMatches.map((m,i)=>{const start=Math.max(0,m.offset-45),end=Math.min(snapshot.length,m.offset+m.length+45);return `<article class="proof-match"><span class="proof-kind">${m.rule?.issueType==='misspelling'?'ORTOGRAFIA':'GRAMÁTICA / ESTILO'}</span><p>${esc(m.message)}</p><div class="proof-context">${start?'…':''}${esc(snapshot.slice(start,m.offset))}<mark>${esc(snapshot.slice(m.offset,m.offset+m.length))}</mark>${esc(snapshot.slice(m.offset+m.length,end))}${end<snapshot.length?'…':''}</div><div class="proof-replacements">${(m.replacements||[]).slice(0,6).map((r,j)=>`<button class="secondary" data-fix-match="${i}" data-fix-replacement="${j}">${esc(r.value||'Remover')}</button>`).join('')||'<span class="proof-note">Ajuste este trecho manualmente no bloco.</span>'}</div></article>`;}).join(''):'<p class="proof-success">✓ Nenhum problema encontrado pelas regras locais neste bloco.</p>';
    document.querySelectorAll('[data-fix-match]').forEach(button=>button.onclick=async()=>{
      try {const match=proofMatches[Number(button.dataset.fixMatch)],replacement=match.replacements[Number(button.dataset.fixReplacement)].value,latest=C.findBlock(data,target);if(!latest)throw Error('O bloco não existe mais.');const updated=applySuggestion(latest.block.text,match,replacement,proofSnapshot);checkpoint();latest.block.text=updated;const selectedOption=$('#proof-block option:checked');if(selectedOption)selectedOption.textContent=updated.slice(0,85);changed(latest.page.id);editing=null;render();toast('Sugestão aplicada.');await runProofread();}catch(error){toast(error.message);}
    });
  }catch(error){if(request===proofRequest&&$('#proof-results'))$('#proof-results').innerHTML=`<p class="error-banner">${esc(error.name==='AbortError'?'O corretor demorou a responder. Aguarde alguns segundos e tente novamente.':error.message)}</p>`;}
  finally {clearTimeout(timer);if($('#proof-run'))$('#proof-run').disabled=false;}
}

const localState=()=>({revision,generation,dirty,saving,conflict,ready});
async function syncRequest(path,body) {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try {const response=await fetch(path,{...(body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),signal:controller.signal});const out=await response.json();if(!response.ok)throw Error(out.error||'Servidor local indisponível.');return out;}
  finally {clearTimeout(timer);}
}
function applyRemoteState(state,baseline) {
  if(dirty||saving||conflict||generation!==baseline.generation||revision!==baseline.revision)return false;
  const incoming=C.importData(state.data),active=document.activeElement;
  const focus=active?.matches('.block-editor')?{editor:active.dataset.editor,scope:active.closest('[data-scope]')?.dataset.scope,start:active.selectionStart,end:active.selectionEnd,direction:active.selectionDirection}:active?.id?{id:active.id,start:active.selectionStart,end:active.selectionEnd}:null;
  const scroll={x:window.scrollX,y:window.scrollY,main:$('#main').scrollTop,right:$('#right-panel').scrollTop,sidebar:$('#sidebar').scrollTop};
  const filters=['page-filter','graph-filter'].map(id=>[id,$('#'+id)?.value]);
  const details=[...$('#main').querySelectorAll('details')].map(el=>el.open);
  const oldTitle=pageById(current)?.title;
  data=incoming;revision=state.revision;generation++;dirty=false;undo=[];redo=[];proofRequest++;
  for(const entry of datalogCache.values())entry.worker?.terminate();datalogCache.clear();
  current=pageById(current)?.id||(oldTitle?C.findPage(data,oldTitle)?.id:null)||data.pages[0]?.id||null;
  if(zoom&&C.findBlock(data,zoom)?.page.id!==current)zoom=null;
  rightStack=rightStack.filter(item=>pageById(item.page)&&(!item.block||C.findBlock(data,item.block)?.page.id===item.page));right=rightStack[0]?.page||null;
  if(editing&&!C.findBlock(data,editing.id))editing=null;
  selectedBlocks=new Set([...selectedBlocks].filter(id=>C.findBlock(data,id)));
  if(view==='page')history.replaceState(null,'',current?'#p/'+encodeURIComponent(current)+(zoom?'/b/'+encodeURIComponent(zoom):''):'#');
  render();
  filters.forEach(([id,value])=>{const el=$('#'+id);if(el&&value!==undefined){el.value=value;if(id==='page-filter')renderPageList(value);else renderGraph(value);}});
  [...$('#main').querySelectorAll('details')].forEach((el,i)=>{if(details[i]!==undefined)el.open=details[i];});
  const restored=focus?.editor?document.querySelector(`[data-scope="${CSS.escape(focus.scope||'main')}"] [data-editor="${CSS.escape(focus.editor)}"]`):focus?.id?document.getElementById(focus.id):null;
  if(restored){restored.focus({preventScroll:true});if(typeof restored.setSelectionRange==='function'&&Number.isInteger(focus.start)){try{restored.setSelectionRange(Math.min(focus.start,restored.value.length),Math.min(focus.end,restored.value.length),focus.direction);}catch{}}}
  $('#main').scrollTop=scroll.main;$('#right-panel').scrollTop=scroll.right;$('#sidebar').scrollTop=scroll.sidebar;window.scrollTo(scroll.x,scroll.y);
  status('✓ Atualizado neste computador');return true;
}
async function init() {
  try {const state=await syncRequest('/api/state');data=C.importData(state.data);revision=state.revision;status('✓ Salvo neste computador');ready=true;route();liveSync?.activity();void liveSync?.poll();}
  catch(e){status('Falha ao abrir',true);$('#main').innerHTML=`<h1>Não foi possível abrir o grafo</h1><p>${esc(e.message)}</p><p>Inicie o Trama com <code>start.cmd</code> no Windows ou <code>bash start.sh</code> no Linux e abra o endereço exibido.</p>`;}
}
const featureContext={get data(){return data;},get page(){return pageById(current);},get editing(){return editing;},get revision(){return revision;},finishEditing(){editing=null;},checkpoint,changed,render,edit,toast,modal,openPage,download,flush,backup,
  localState,syncHold:key=>liveSync?.hold(key),syncRelease:key=>liveSync?.release(key),
  language:()=>proofLanguage,setLanguage:language=>{proofLanguage=language;try{localStorage.setItem('trama-proof-language',language);}catch{}document.querySelectorAll('.block-editor').forEach(el=>el.lang=language);},
  replaceData:async state=>{checkpoint();data=C.importData(state);current=data.pages[0]?.id;rightStack=[];right=null;editing=null;zoom=null;view=current?'page':'pages';changed();render();if(!await flush())throw Error('Não foi possível salvar a restauração.');history.replaceState(null,'',current?'#p/'+current:'#pages');},
  syncConfigured:state=>{const next=!!state.automatic;if(next!==automaticSync){automaticSync=next;if(ready&&!data.pages.length&&view==='page')render();}},
  reloadData:async()=>{const baseline=localState();if(dirty||saving||conflict)throw Error('Há alterações nesta janela. Salve ou exporte antes de receber uma versão.');const state=await syncRequest('/api/state');if(!applyRemoteState(state,baseline))throw Error('Você editou durante a atualização. Seu texto foi preservado nesta janela; salve ou exporte antes de continuar.');}
};
F=setupFeatures(featureContext);
liveSync=createSyncClient({getState:localState,fetchRevision:()=>syncRequest('/api/revision'),fetchState:()=>syncRequest('/api/state'),applyRemote:applyRemoteState,sendActivity:body=>syncRequest('/api/sync/activity',body),onRefresh:()=>void syncUI?.refresh()});
bindSyncActivity(liveSync,document);
window.addEventListener('focus',()=>{liveSync.activity();void liveSync.poll();});
window.addEventListener('pagehide',()=>{liveSync.stop();syncUI?.stop();});
window.addEventListener('pageshow',e=>{if(e.persisted){liveSync.start();syncUI?.start();}});
syncUI=setupSync(featureContext);
setupDictionary(featureContext);
const learningUI=setupLearning(featureContext);
featureContext.learningDrafts=learningUI.drafts;
bindDraftActivity(liveSync,learningUI.drafts);
const translationUI=setupTranslation(featureContext);
featureContext.flushDrafts=async()=>{
  const translationSaved=await translationUI.flushDrafts();
  const learningSaved=await learningUI.flushDrafts();
  return translationSaved&&learningSaved;
};
featureContext.draftBackupState=()=>({archived:learningUI.drafts.archived.length});
featureContext.updateClientId=liveSync.client;
setupVocabulary(featureContext);
setupBackup(featureContext);
setupUpdates(featureContext);
setupLiveWriting(featureContext);
liveSync.start();
init();
