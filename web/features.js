import * as C from './core.js';
import {escapeHTML as esc} from './renderer.js';

export const commands=[
 ['todo','Tarefa pendente'],['done','Tarefa concluída'],['today','Data de hoje'],['tomorrow','Data de amanhã'],['yesterday','Data de ontem'],['date','Escolher data'],['time','Hora atual'],
 ['h1','Título 1'],['h2','Título 2'],['h3','Título 3'],['normal','Texto normal'],['numbered','Lista numerada'],['document','Modo documento'],['bullet','Lista de tópicos'],
 ['reference','Referenciar outro bloco'],['table','Tabela editável'],['kanban','Quadro Kanban'],['query','Consulta visual'],['embed','Incorporar página ou bloco'],['code','Bloco de código'],['math','Fórmula LaTeX'],
 ['upload','Anexar arquivo'],['template','Inserir template'],['save-template','Marcar como template'],['calc','Calculadora'],['slider','Controle deslizante'],['word-count','Contagem de palavras'],['pomodoro','Temporizador Pomodoro'],['divider','Linha divisória']
].map(([command,label])=>({command,label:`/${command} · ${label}`}));

export function setupFeatures(ctx) {
  const $=s=>document.querySelector(s),entry=id=>C.findBlock(ctx.data,id);
  const timers=new Map();let pendingAttachment=null;
  function mutate(id,fn,edit=false) {const e=entry(id);if(!e)return;ctx.checkpoint();fn(e.block,e);ctx.changed(e.page.id);const scope=ctx.editing?.scope||'main';ctx.finishEditing?.();ctx.render();if(edit)ctx.edit(id,scope);}
  function setText(id,text,edit=false){mutate(id,b=>b.text=text,edit);}
  function insert(id,text){mutate(id,b=>b.text+=(b.text?' ':'')+text,true);}
  function target(){return ctx.editing?.id||ctx.page?.blocks?.[0]?.id;}
  function date(delta=0){const d=new Date();d.setDate(d.getDate()+delta);return d.toLocaleDateString('sv-SE');}
  function execute(command,id=target()) {
    const e=entry(id);if(!e){ctx.toast('Abra uma página e escolha um bloco.');return;}
    if(command==='reference'){ctx.beginReference?.(id);return;}
    if(command.startsWith('template:')){mutate(id,()=>C.instantiateTemplate(ctx.data,command.slice(9),id));return;}
    if(['todo','done'].includes(command)){insert(id,`{{[[${command.toUpperCase()}]]}}`);return;}
    if(['today','tomorrow','yesterday'].includes(command)){insert(id,`[[${date(command==='today'?0:command==='tomorrow'?1:-1)}]]`);return;}
    if(command==='time'){insert(id,new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}));return;}
    if(command==='date'){ctx.modal('Inserir data',`<label>Data <input id="feature-date" type="date" value="${date()}"></label><div class="modal-actions"><button class="primary" data-feature="insert-date" data-id="${esc(id)}">Inserir link de data</button></div>`);return;}
    if(/^h[123]$/.test(command)||command==='normal'){mutate(id,b=>b.heading=command==='normal'?0:Number(command[1]));return;}
    if(['numbered','bullet','document'].includes(command)){mutate(id,b=>b.view=command);return;}
    if(command==='table'){mutate(id,b=>{b.text='{{table}}';if(!b.children.length){for(const cells of [['Coluna 1','Coluna 2'],['','']]){const row=C.newBlock(cells[0]);row.children=[C.newBlock(cells[1])];b.children.push(row);}}});return;}
    if(command==='kanban'){mutate(id,b=>{b.text='{{kanban}}';if(!b.children.length)b.children=['A fazer','Em andamento','Concluído'].map(t=>C.newBlock(t));});return;}
    if(command==='query'){queryBuilder(id);return;}
    if(command==='template'){templates(id);return;}
    if(command==='save-template'){if(!/#roam\/templates|\[\[roam\/templates\]\]/.test(e.block.text))insert(id,'#roam/templates');return;}
    if(command==='upload'){pendingAttachment=id;$('#attachment-input').click();return;}
    if(command==='embed'){ctx.modal('Incorporar conteúdo',`<p>Use o título de uma página ou uma referência ((id)) copiada do menu de um bloco.</p><input id="embed-destination" type="text" placeholder="Página ou ((id))"><div class="modal-actions"><button class="primary" data-feature="insert-embed" data-id="${esc(id)}">Incorporar</button></div>`);return;}
    const values={code:'```\nSeu código aqui\n```',math:'$$E = mc^2$$',calc:'{{calc: 2 + 3 * 4}}',slider:'{{slider: 0 100 50}}','word-count':'{{word-count}}',pomodoro:'{{pomodoro: 25}}',divider:'---'};
    if(values[command])setText(id,values[command],['code','math','calc'].includes(command));
  }
  function blockMenu(id) {
    const e=entry(id);if(!e)return;
    ctx.modal('Bloco · conteúdo e organização',`<div class="feature-toolbar"><button class="secondary" data-proof="${esc(id)}">Revisar texto</button><button class="secondary" data-copy="${esc(id)}">Copiar referência</button><button class="secondary" data-embed-copy="${esc(id)}">Copiar incorporação</button><button class="secondary" data-duplicate="${esc(id)}">Duplicar</button></div><div class="feature-section">FORMATAÇÃO</div><div class="feature-toolbar">${['normal','h1','h2','h3','bullet','numbered','document'].map(c=>`<button class="secondary" data-command="${c}" data-id="${esc(id)}">${esc(c)}</button>`).join('')}${['left','center','right'].map(a=>`<button class="secondary" data-feature="align" data-value="${a}" data-id="${esc(id)}">${{left:'Esquerda',center:'Centro',right:'Direita'}[a]}</button>`).join('')}</div><div class="feature-section">INSERIR E REUTILIZAR</div><div class="feature-toolbar">${['reference','table','kanban','query','template','save-template','upload','embed','code','math','pomodoro'].map(c=>`<button class="secondary" data-command="${c}" data-id="${esc(id)}">${esc(commands.find(x=>x.command===c).label.split(' · ')[1])}</button>`).join('')}</div><div class="feature-toolbar"><button class="secondary" data-feature="move-block" data-id="${esc(id)}">Mover para página</button><button class="secondary" data-feature="convert-ref" data-id="${esc(id)}">Referências → texto</button><button class="secondary danger" data-delete-block="${esc(id)}">Excluir bloco e filhos</button></div><p class="empty-state">Digite / para inserir componentes; ;; para escolher um template. Ctrl+B aplica negrito, Ctrl+I itálico e Ctrl+H destaque.</p>`);
  }
  function templates(id=target()) {
    const items=C.listTemplates(ctx.data);
    ctx.modal('Templates reutilizáveis',`<p>Marque um bloco com <code>#roam/templates</code>. Seus filhos serão inseridos como uma nova cópia, com IDs próprios.</p>${items.length?items.map(t=>`<button class="search-result" data-feature="apply-template" data-id="${esc(id||'')}" data-template="${esc(t.id)}">${esc(t.label)}<small>${esc(t.page.title)} · ${t.block.children.length} blocos filhos</small></button>`).join(''):'<p class="empty-state">Nenhum template criado. Use o menu de um bloco → Marcar como template.</p>'}`);
  }
  function queryBuilder(id=target()) {
    if(!id){ctx.toast('Escolha um bloco para a consulta.');return;}
    ctx.modal('Construir consulta',`<p>Combine links, texto e intervalo de datas. Condições aninhadas podem ser editadas depois na sintaxe do bloco.</p><label>Combinação <select id="query-op"><option value="and">Todas as condições (AND)</option><option value="or">Qualquer condição (OR)</option></select></label><label>Páginas ou tags (uma por linha)<textarea id="query-pages" rows="3" placeholder="Projeto\nTODO"></textarea></label><label>Excluir página <input id="query-not" type="text" placeholder="Arquivado"></label><label>Texto contém <input id="query-text" type="text"></label><div class="feature-grid"><label>De <input id="query-from" type="date"></label><label>Até <input id="query-to" type="date"></label></div><div class="modal-actions"><button class="primary" data-feature="create-query" data-id="${esc(id)}">Inserir consulta</button></div>`);
  }
  function calendar() {ctx.modal('Notas diárias',`<label>Abrir uma data <input id="daily-date" type="date" value="${date()}"></label><div class="modal-actions"><button class="primary" data-feature="open-date">Abrir nota diária</button></div><div class="feature-section">DIAS COM NOTAS</div>${ctx.data.pages.filter(p=>/^\d{4}-\d{2}-\d{2}$/.test(p.title)).sort((a,b)=>b.title.localeCompare(a.title)).slice(0,90).map(p=>`<a class="sidebar-page" href="#p/${encodeURIComponent(p.id)}" data-feature="close-link">${esc(p.title)}</a>`).join('')}`);}
  async function history() {
    if(!await ctx.flush()){ctx.toast('Salve suas alterações antes de abrir o histórico.');return;}
    const res=await fetch('/api/history');const result=await res.json();if(!res.ok)throw Error(result.error);
    const list=Array.isArray(result)?result:result.history||result.revisions||[];
    ctx.modal('Histórico do grafo',`<p>Restaurar cria uma nova revisão. O estado atual recebe um backup antes da substituição.</p><div class="history-list">${list.map(item=>`<button class="search-result" data-feature="preview-history" data-revision="${item.revision}">Revisão ${item.revision}<small>${esc(new Date(item.created).toLocaleString('pt-BR'))} · ${item.pages} páginas · ${item.blocks} blocos</small></button>`).join('')||'<p>Nenhuma revisão registrada ainda.</p>'}</div>`);
  }
  async function previewHistory(revision) {
    const res=await fetch(`/api/history/${revision}`),out=await res.json();if(!res.ok)throw Error(out.error);
    const state=C.importData(out.data);
    ctx.modal(`Revisão ${revision}`,`<p>${state.pages.length} páginas e ${C.walkBlocks(state.pages).length} blocos.</p><div class="history-preview">${state.pages.slice(0,30).map(p=>`<div><strong>${esc(p.title)}</strong><p>${esc(p.blocks.slice(0,3).map(b=>b.text).join(' · '))}</p></div>`).join('')}</div><div class="modal-actions"><button class="secondary" data-feature="history">Voltar</button><button class="primary" id="restore-history">Restaurar esta revisão</button></div>`);
    $('#restore-history').onclick=async()=>{try{$('#restore-history').disabled=true;await ctx.backup();await ctx.replaceData(state);$('#modal').close();ctx.toast('Revisão restaurada; estado anterior preservado em backup.');}catch(e){ctx.toast(e.message);if($('#restore-history'))$('#restore-history').disabled=false;}};
  }
  async function attachments() {
    const res=await fetch('/api/attachments'),out=await res.json();if(!res.ok)throw Error(out.error);const items=Array.isArray(out)?out:out.attachments||[];
    ctx.modal('Arquivos deste grafo',`<p>Arquivos ficam na pasta de dados local. Para transportar notas e anexos juntos, use Exportar grafo completo.</p><div class="feature-toolbar"><button class="primary" data-command="upload" data-id="${esc(target()||'')}">Anexar arquivo</button><a class="secondary" href="/api/vault.zip" download>Exportar grafo completo</a></div>${items.map(f=>`<div class="attachment-row"><a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.name)}</a><span>${(f.size/1024).toFixed(1)} KB</span><button class="secondary" data-feature="link-file" data-url="${esc(f.url)}" data-name="${esc(f.name)}" data-type="${esc(f.type)}">Inserir no bloco</button></div>`).join('')||'<p class="empty-state">Nenhum anexo.</p>'}`);
  }
  function fileMarkup(f){const name=f.name.replace(/[\[\]\r\n]/g,'');return f.type.startsWith('image/')?`![${name}](${f.url})`:f.type==='application/pdf'?`{{pdf: ${f.url}}}`:f.type.startsWith('audio/')?`{{audio: ${f.url}}}`:f.type.startsWith('video/')?`{{video: ${f.url}}}`:`[${name}](${f.url})`;}
  const input=document.createElement('input');input.id='attachment-input';input.type='file';input.hidden=true;document.body.append(input);
  input.onchange=async()=>{const file=input.files[0];input.value='';if(!file)return;const id=pendingAttachment;pendingAttachment=null;try{if(file.size>20*1024*1024)throw Error('Limite de 20 MB por anexo.');ctx.toast('Salvando anexo local…');const binary=new Uint8Array(await file.arrayBuffer());let raw='';for(let i=0;i<binary.length;i+=8192)raw+=String.fromCharCode(...binary.subarray(i,i+8192));const res=await fetch('/api/attachments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:file.name,type:file.type,data:btoa(raw)})}),out=await res.json();if(!res.ok)throw Error(out.error);if(!entry(id))throw Error('O bloco de destino não existe mais. O arquivo está em Arquivos.');$('#modal').close();insert(id,fileMarkup(out));ctx.toast('Anexo inserido.');}catch(error){ctx.toast(error.message);}};
  const vault=document.createElement('input');vault.type='file';vault.accept='.zip,application/zip';vault.hidden=true;document.body.append(vault);
  vault.onchange=async()=>{const file=vault.files[0];vault.value='';if(!file)return;ctx.modal('Restaurar grafo completo?',`<p>“${esc(file.name)}” substituirá as notas e adicionará os anexos deste grafo; arquivos anteriores serão preservados para o histórico. Um backup será criado antes da restauração.</p><div class="modal-actions"><button class="secondary" data-action="close-modal">Cancelar</button><button class="primary" id="restore-vault">Restaurar ZIP</button></div>`);$('#restore-vault').onclick=async()=>{try{$('#restore-vault').disabled=true;if(file.size>110*1024*1024)throw Error('ZIP excede 110 MB.');if(!await ctx.flush())throw Error('Salve as alterações pendentes.');const bytes=new Uint8Array(await file.arrayBuffer());let raw='';for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));const res=await fetch('/api/vault/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:ctx.revision,data:btoa(raw)})}),out=await res.json();if(!res.ok)throw Error(out.error);await ctx.reloadData();$('#modal').close();ctx.toast('Grafo completo restaurado.');}catch(error){ctx.toast(error.message);if($('#restore-vault'))$('#restore-vault').disabled=false;}};};
  function specialHTML(block) {
    if(block.text.trim()==='---')return '<hr class="note-divider">';
    const timer=block.text.trim().match(/^\{\{pomodoro:\s*(\d+)\s*\}\}$/);if(!timer)return null;
    const duration=Math.max(1,Math.min(240,Number(timer[1]))),state=timers.get(block.id),remaining=state?Math.max(0,Math.ceil((state.end-Date.now())/1000)):duration*60;
    return `<div class="pomodoro" data-timer="${esc(block.id)}"><strong data-timer-clock>${String(Math.floor(remaining/60)).padStart(2,'0')}:${String(remaining%60).padStart(2,'0')}</strong><button class="secondary" data-feature="timer" data-id="${esc(block.id)}" data-minutes="${duration}">${state?'Reiniciar':'Iniciar'}</button><button class="secondary" data-feature="timer-stop" data-id="${esc(block.id)}">Parar</button></div>`;
  }
  setInterval(()=>{for(const [id,state] of timers){const remaining=Math.max(0,Math.ceil((state.end-Date.now())/1000));document.querySelectorAll(`[data-timer="${CSS.escape(id)}"] [data-timer-clock]`).forEach(el=>el.textContent=`${String(Math.floor(remaining/60)).padStart(2,'0')}:${String(remaining%60).padStart(2,'0')}`);if(!remaining&&!state.finished){state.finished=true;ctx.toast('Pomodoro concluído.');}}},1000);
  document.addEventListener('click',async event=>{
    const command=event.target.closest('[data-command]');if(command){try{event.preventDefault();const name=command.dataset.command;if(!['template','query','upload','embed','date'].includes(name))$('#modal').close();execute(name,command.dataset.id||target());}catch(error){ctx.toast(error.message);}return;}
    const el=event.target.closest('[data-feature]');if(!el)return;
    const id=el.dataset.id,action=el.dataset.feature;
    try {
      if(action==='close-link'){$('#modal').close();return;}
      event.preventDefault();
      if(action==='templates')templates();
      else if(action==='calendar')calendar();
      else if(action==='history')await history();
      else if(action==='attachments')await attachments();
      else if(action==='vault-import')vault.click();
      else if(action==='export-roam')ctx.download(`trama-roam-${date()}.json`,JSON.stringify(C.exportRoam(ctx.data),null,2));
      else if(action==='preview-history')await previewHistory(el.dataset.revision);
      else if(action==='align'){mutate(id,b=>b.alignment=el.dataset.value);$('#modal').close();}
      else if(action==='apply-template'){if(!entry(id))throw Error('Escolha um bloco em uma página antes de inserir o template.');mutate(id,()=>C.instantiateTemplate(ctx.data,el.dataset.template,id));$('#modal').close();}
      else if(action==='insert-date'){const value=$('#feature-date').value;if(value){$('#modal').close();insert(id,`[[${value}]]`);}}
      else if(action==='open-date'){const value=$('#daily-date').value;if(value){$('#modal').close();ctx.openPage(value);}}
      else if(action==='insert-embed'){const value=$('#embed-destination').value.trim();if(!value)return;$('#modal').close();insert(id,`{{embed: ${/^\(\([A-Za-z0-9_-]+\)\)$/.test(value)?value:`[[${value}]]`}}}`);}
      else if(action==='create-query') {
        const names=$('#query-pages').value.split('\n').map(x=>x.trim()).filter(Boolean),parts=names.map(n=>`[[${n}]]`),text=$('#query-text').value.trim(),exclude=$('#query-not').value.trim(),from=$('#query-from').value,to=$('#query-to').value;
        if(names.some(n=>/[\[\]{}]/.test(n))||/[{}]/.test(text)||/[\[\]{}]/.test(exclude))throw Error('Use nomes e texto sem chaves ou colchetes.');
        if(text)parts.push(`{search: ${JSON.stringify(text)}}`);if(exclude)parts.push(`{not: [[${exclude}]]}`);if(from&&to)parts.push(`{between: [[${from}]] [[${to}]]}`);if(!parts.length)throw Error('Adicione ao menos uma condição.');
        const query=`{{query: {${$('#query-op').value}: ${parts.join(' ')}}}}`;$('#modal').close();setText(id,query);
      } else if(action==='move-block') {
        ctx.modal('Mover bloco e filhos',`<label>Página de destino<input id="move-page" type="text" list="move-pages"><datalist id="move-pages">${ctx.data.pages.map(p=>`<option value="${esc(p.title)}">`).join('')}</datalist></label><div class="modal-actions"><button class="primary" data-feature="do-move" data-id="${esc(id)}">Mover</button></div>`);
      } else if(action==='do-move') {const title=$('#move-page').value.trim();if(!title)return;const e=entry(id);ctx.checkpoint();const p=C.ensurePage(ctx.data,title);e.siblings.splice(e.index,1);p.blocks.push(e.block);if(!e.page.blocks.length)e.page.blocks.push(C.newBlock());ctx.changed(e.page.id);ctx.changed(p.id);$('#modal').close();ctx.openPage(p.title);}
      else if(action==='convert-ref'){mutate(id,b=>b.text=b.text.replace(/\(\(([A-Za-z0-9_-]+)\)\)/g,(all,ref)=>entry(ref)?.block.text||all));$('#modal').close();}
      else if(action==='link-file'){const dest=target();if(!dest)throw Error('Abra uma página primeiro.');$('#modal').close();insert(dest,fileMarkup({name:el.dataset.name,url:el.dataset.url,type:el.dataset.type}));}
      else if(action==='timer'){timers.set(id,{end:Date.now()+Number(el.dataset.minutes)*60000});ctx.render();}
      else if(action==='timer-stop'){timers.delete(id);ctx.render();}
    }catch(error){ctx.toast(error.message);}
  });
  return {execute,blockMenu,templates,calendar,history,attachments,specialHTML};
}
