import {escapeHTML as esc} from './renderer.js';

const STATE_LABELS={disabled:'Modo manual',waiting:'Aguardando nova verificação',checking:'Verificando alterações…',idle:'Verificação concluída',publishing:'Enviando cópias…',receiving:'Recebendo alterações…',conflict:'Versões diferentes: compare antes de escolher',choice_required:'Escolha a versão inicial',error:'Transferência pendente: precisa de atenção',stopped:'Sincronização interrompida'};
const count=value=>Number.isSafeInteger(value)&&value>=0?String(value):'—';
const dateLabel=value=>{const date=new Date(value);return value&&Number.isFinite(date.getTime())?date.toLocaleString('pt-BR'):'data indisponível';};
const localMessage=local=>local.conflict?'Há alterações desta janela que não foram salvas. Baixe uma cópia antes de recarregar.':local.saving?'Salvando as notas neste computador.':local.dirty?'Há notas nesta janela ainda aguardando salvamento.':'';

/** A folder being up to date never certifies the state of an external cloud client. */
export function syncPresentation(status,local={},connectionError='') {
  if(connectionError)return {state:'unavailable',label:'Servidor local indisponível',message:'Não foi possível verificar a sincronização. Mantenha esta janela aberta e inicie o Trama novamente. '+connectionError};
  if(!status?.configured&&status?.auto?.state!=='error')return {state:'disabled',label:'Conectar outro computador',message:'Escolha como transportar cópias das suas notas. O banco continua neste computador.'};
  const automatic=!!status.automatic,folder=status.transport!=='proton',auto=status.auto||{};
  let state=auto.state||(automatic?'waiting':'disabled'),message=auto.message||status.message||'';
  if(local.conflict){state='local-conflict';message=localMessage(local);}
  else if(!['error','conflict','choice_required'].includes(state)&&status.conflict&&!status.pendingMerge){state='conflict';message='Existem versões feitas a partir de alterações diferentes. As alternativas estão preservadas.';}
  else if(!['error','conflict','choice_required'].includes(state)&&status.incomplete>0){state='incomplete';message='Há cópias incompletas ou inválidas na pasta. Confira a transferência e os arquivos indicados antes de continuar.';}
  else if(!['error','conflict','choice_required','publishing','receiving'].includes(state)) {
    if(local.dirty||local.saving){state='saving';message=localMessage(local)+' A sincronização só publica o que foi salvo.';}
    else if(status.localChanges||status.pendingMerge){state='pending';message=status.pendingMerge?(automatic?'Sua escolha foi guardada e será publicada automaticamente na próxima verificação.':'Sua escolha foi guardada. Publique uma nova cópia para registrar essa escolha nos outros computadores.'):automatic?'Suas notas estão salvas neste computador. A próxima verificação prepara a cópia para transferência.':'Suas notas estão salvas neste computador. Use Publicar cópia para colocá-las na pasta de troca.';}
    else if(!automatic){state='disabled';message='O envio e o recebimento automáticos estão desligados. Verificar agora apenas confere a pasta local; publicar e receber dependem da sua escolha.';}
    else if(state==='waiting'&&auto.clientsBusy){state='editing';message='A chegada de outra versão aguarda o fim da edição ou de uma comparação aberta. Suas notas continuam disponíveis.';}
  }
  const labels={'local-conflict':'Texto desta janela precisa de atenção',incomplete:'Cópia incompleta: confira os arquivos',saving:local.saving?'Salvando antes de sincronizar…':'Notas ainda não salvas',pending:automatic?'Notas salvas aguardando transferência':'Cópia local ainda não publicada',editing:'Recebimento pausado durante a edição'};
  let label=labels[state]||STATE_LABELS[state]||'Sincronização';
  if(state==='idle')label=folder?'Pasta local atualizada':'Última verificação do Proton concluída';
  if(localMessage(local)&&!['saving','local-conflict'].includes(state))message+=' '+localMessage(local);
  if(folder)message+=' O envio à nuvem depende do aplicativo Proton ou do sincronizador desta pasta; o Trama verifica somente a pasta local.';
  return {state,label,message,lastSuccess:auto.lastSuccess};
}

export function safeProtonLoginURL(value) {
  try {const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&['account.proton.me','account.protonmail.com'].includes(url.hostname)?url.href:null;}catch{return null;}
}

export function syncReceiveRequest(id,preview,local,revision) {
  const token=preview?.preview;
  if(!preview||preview.id!==id||!Number.isSafeInteger(preview.revision)||preview.revision<0||!token||typeof token.fingerprint!=='string'||typeof token.snapshotHash!=='string'||!Array.isArray(token.heads))throw Error('A comparação não pôde ser validada. Compare novamente antes de receber.');
  if(preview.safeToReceive===false)throw Error('Esta versão contém um conflito de anexos e não pode ser recebida.');
  if(local.ready===false||local.dirty||local.saving||local.conflict||revision!==preview.revision)throw Error('As notas mudaram desde a comparação. Compare novamente antes de receber.');
  return {id,revision:preview.revision,preview:token};
}

/** The preview is escaped independently of its source, including page titles and excerpts. */
export function syncComparisonHTML(preview) {
  const changes=preview.changes||{},attachments=preview.attachments||{},snapshot=preview.snapshot||{};
  const row=(label,key)=>`<div><strong>${count(changes[key])}</strong><span>${label}</span></div>`;
  return `<p>Cópia de <strong>${esc(snapshot.deviceName||snapshot.device||'outro computador')}</strong>, de ${esc(dateLabel(snapshot.created))}.</p><p>Agora: ${count(preview.local?.pages)} páginas e ${count(preview.local?.blocks)} blocos. Cópia escolhida: ${count(snapshot.pages)} páginas e ${count(snapshot.blocks)} blocos.</p><div class="sync-comparison-counts">${row('páginas adicionadas','addedPages')}${row('páginas removidas','removedPages')}${row('páginas alteradas','changedPages')}${row('blocos adicionados','addedBlocks')}${row('blocos removidos','removedBlocks')}${row('blocos alterados','changedBlocks')}</div><p class="proof-note">Anexos: ${count(attachments.added)} novos, ${count(attachments.changed)} com conteúdo diferente; ${count(attachments.keptLocal)} arquivos exclusivos deste computador serão mantidos.</p>${preview.safeToReceive===false?'<p class="error-banner">Há anexos com o mesmo nome e conteúdos diferentes. Esta versão não pode ser recebida até o conflito ser resolvido; nenhum arquivo será sobrescrito.</p>':''}${preview.pages?.length?`<details class="sync-preview-details"><summary>Ver páginas que mudam (${preview.pages.length}${preview.truncated?' de uma lista maior':''})</summary><ul>${preview.pages.map(page=>`<li><strong>${esc(page.title)}</strong> · ${esc(({added:'adicionada',removed:'removida',changed:'alterada'})[page.kind]||page.kind)}<small>Blocos: +${count(page.addedBlocks)} / −${count(page.removedBlocks)} / ${count(page.changedBlocks)} alterados</small></li>`).join('')}</ul></details>`:''}${preview.blockChanges?.length?`<details class="sync-preview-details"><summary>Ver amostras dos textos (${preview.blockChanges.length})</summary>${preview.blockChanges.map(block=>`<article><strong>${esc(block.page||'Bloco')} · ${esc(({added:'adicionado',removed:'removido',changed:'alterado'})[block.kind]||block.kind)}</strong><div class="sync-text-diff"><div><small>Neste computador</small><pre>${esc(block.before??'—')}</pre></div><div><small>Na cópia escolhida</small><pre>${esc(block.after??'—')}</pre></div></div></article>`).join('')}${preview.blocksTruncated?'<p class="proof-note">Amostra limitada. Os totais acima incluem todas as alterações.</p>':''}</details>`:''}<p class="proof-note">Receber substitui o grafo completo por esta cópia. Não combina os textos automaticamente. A versão local recebe backup e, quando necessário, uma cópia de recuperação.</p>`;
}

export function setupSync(ctx) {
  const $=s=>document.querySelector(s);
  let latest=null,refreshing=false,loginWaiting=false,openRequest=0,statusRequest=0,connectionError='',interval=null,comparison=null,stopped=false;
  const local=()=>ctx.localState?.()||{};
  async function api(path,body) {
    if(body!==undefined&&['config','check','publish','receive'].includes(path))statusRequest++;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),path==='preview'?30000:15000);
    try {
      const response=await fetch('/api/sync/'+path,{...(body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),signal:controller.signal});
      const out=await response.json();
      if(!response.ok){const error=new Error(out.error||'Não foi possível acessar a sincronização.');error.code=out.code;error.status=response.status;throw error;}
      return out;
    }catch(error){if(error.name==='AbortError')throw Error('A verificação demorou mais que o esperado. Suas notas permanecem neste computador; tente novamente.');throw error;}
    finally{clearTimeout(timer);}
  }
  function releaseComparison(){if(comparison){ctx.syncRelease?.(comparison.key);comparison=null;}}
  const comparisonActive=session=>comparison===session&&session.element?.isConnected&&$('#modal')?.open!==false;
  function stateHTML(status) {
    const item=syncPresentation(status,local(),connectionError),warning=['conflict','choice_required','error','unavailable','local-conflict','incomplete'].includes(item.state),auto=status.auto||{};
    const times=[['Última verificação',auto.lastCheck],['Cópia publicada nesta pasta',auto.lastPublished],['Envio ao Proton concluído',auto.lastUpload],['Busca no Proton concluída',auto.lastDownload],['Notas recebidas neste computador',auto.lastReceived]].filter(([,value])=>value);
    return `<div class="sync-status ${warning?'sync-conflict':''}" data-sync-state="${esc(item.state)}"><strong>${esc(item.label)}</strong><p>${esc(item.message)}</p>${auto.checkPending?'<small>Há uma verificação solicitada aguardando o ciclo atual terminar.</small>':''}${auto.nextRetry?`<small>Próxima tentativa automática: ${esc(dateLabel(auto.nextRetry))}. Você também pode usar Verificar agora.</small>`:''}${times.length?`<dl class="sync-times">${times.map(([label,value])=>`<div><dt>${label}</dt><dd>${esc(dateLabel(value))}</dd></div>`).join('')}</dl>`:'<small>Nenhuma verificação concluída registrada nesta sessão.</small>'}${['conflict','choice_required'].includes(item.state)?'<p>Compare as cópias abaixo antes de escolher. Os textos divergentes não são mesclados automaticamente.</p>':''}${status.incompleteFiles?.length?`<ul class="sync-problems">${status.incompleteFiles.slice(0,5).map(file=>`<li><code>${esc(file.file)}</code>${file.message?` · ${esc(file.message)}`:''}</li>`).join('')}</ul>`:''}</div>`;
  }
  function snapshotsHTML(status) {
    return (status.snapshots||[]).map(item=>`<article class="sync-snapshot ${status.heads?.includes(item.id)?'sync-head':''}"><div><strong>${esc(item.deviceName||item.device)}</strong><small>${esc(dateLabel(item.created))} · ${count(item.pages)} páginas · ${count(item.blocks)} blocos ${item.id===status.base?'· base atual neste computador':''}${status.heads?.includes(item.id)?' · versão mais recente':''}</small></div><button class="secondary" data-sync-compare="${esc(item.id)}">Comparar e escolher</button></article>`).join('')||'<p class="empty-state">Nenhuma cópia completa encontrada. Abra o Trama no computador que já contém suas notas e publique uma cópia, ou deixe o modo automático concluir a primeira transferência.</p>';
  }
  function paintStatus() {
    const item=syncPresentation(latest,local(),connectionError);
    document.querySelectorAll('[data-sync-indicator]').forEach(el=>{const label=el.querySelector('[data-sync-label]')||el;if(label.textContent!==item.label)label.textContent=item.label;el.dataset.syncState=item.state;el.title=item.message;el.setAttribute('aria-label',item.label+'. Abrir sincronização.');});
    const display=$('[data-sync-current]');if(display&&latest){const html=stateHTML(latest);if(display.innerHTML!==html)display.innerHTML=html;}
    const list=$('[data-sync-snapshots]');if(list&&latest&&!list.contains(document.activeElement)){const html=snapshotsHTML(latest);if(list.innerHTML!==html)list.innerHTML=html;}
  }
  function update(status){latest=status;connectionError='';ctx.syncConfigured?.(status);paintStatus();}
  async function readStatus(){const token=++statusRequest;try{const status=await api('status');if(!stopped&&token===statusRequest)update(status);return status;}catch(error){if(!stopped&&token===statusRequest){connectionError=error.message;paintStatus();}throw error;}}
  async function refresh() {
    if(refreshing||stopped)return;refreshing=true;
    try{await readStatus();if(loginWaiting&&$('#sync-proton-state'))showLogin(await api('proton/status'));}
    catch{}finally{refreshing=false;}
  }
  function showLogin(info) {
    loginWaiting=info.loginState==='waiting';const el=$('#sync-proton-state');if(!el)return;
    const link=safeProtonLoginURL(info.signInUrl);
    el.innerHTML=`<p>${esc(info.message||(info.installed?'Proton Drive CLI encontrado. Entre na sua conta uma vez.':'Instale o Proton Drive CLI oficial para usar esta opção.'))}</p>${link?`<a href="${esc(link)}" target="_blank" rel="noopener noreferrer">Continuar no login oficial do Proton ↗</a>`:''}`;
    el.dataset.loginState=info.loginState||'idle';const button=$('#sync-proton-login');if(button)button.disabled=loginWaiting;
  }
  function secondComputerHTML(){return `<details class="proof-setup sync-second-computer" id="sync-second-computer"><summary>Conectar o segundo computador · passo a passo</summary><ol><li><strong>No computador com suas notas:</strong> salve a configuração e espere uma cópia aparecer em “Versões disponíveis”. No modo direto, confira o horário do envio ao Proton. No modo pasta, confirme o envio no aplicativo que sincroniza a pasta.</li><li><strong>No outro computador:</strong> abra o Trama e entre em Sincronização. Deixe o grafo vazio para receber suas notas, sem criar exemplos primeiro.</li><li>Escolha o mesmo transporte e a mesma pasta remota. Em “Pasta já sincronizada”, escolha a cópia local dessa pasta. Em “Proton direto”, use o mesmo caminho remoto e faça login uma vez em cada computador.</li><li>Ative o modo automático nos dois e mantenha o Trama aberto. Se o segundo já tiver notas, compare as versões antes de escolher; nada será substituído automaticamente.</li></ol><p>Antes de mudar de computador, confira a conclusão da transferência. A sincronização não é edição simultânea em tempo real. Nunca coloque <code>trama.db</code> na pasta de troca.</p></details>`;}
  function dialogHTML(status) {
    const needsChoice=status.conflict||['choice_required','conflict'].includes(status.auto?.state);
    return `<section data-sync-dialog><p>Suas notas ficam neste computador. Para continuar no outro, o Trama troca cópias completas e preserva versões diferentes para você comparar.</p><div data-sync-current aria-live="polite">${stateHTML(status)}</div><div class="sync-quick-actions"><button class="secondary" type="button" data-sync-check ${status.configured?'':'disabled'}>Verificar agora</button><button class="secondary" type="button" data-sync-export>Baixar cópia desta janela</button><button class="secondary" type="button" data-sync-guide>Conectar segundo computador</button></div><p class="sync-device">Este computador: <strong>${esc(status.deviceName||status.device||'local')}</strong></p><details class="sync-configuration" ${status.configured?'':'open'}><summary>${status.configured?'Ajustar conexão e modo automático':'1 · Configurar a conexão'}</summary><form id="sync-config"><label for="sync-device-name">Nome deste computador</label><input id="sync-device-name" type="text" maxlength="80" value="${esc(status.deviceName||'')}" placeholder="Ex.: notebook ou computador de casa" autocomplete="off"><label class="sync-toggle"><input id="sync-automatic" type="checkbox" ${status.automatic?'checked':''}><span><strong>Sincronização automática</strong><small>Publica notas salvas e recebe novas versões quando a edição estiver livre.</small></span></label><label for="sync-transport">Como transportar as notas</label><select id="sync-transport"><option value="folder" ${status.transport!=='proton'?'selected':''}>Pasta já sincronizada</option><option value="proton" ${status.transport==='proton'?'selected':''}>Proton direto</option></select><p class="proof-note" id="sync-transport-help"></p><label for="sync-folder">Pasta de troca neste computador</label><input id="sync-folder" type="text" value="${esc(status.folder||'')}" placeholder="C:\\Users\\você\\Proton Drive\\Trama ou /home/você/ProtonDrive/Trama" required><p class="proof-note" id="sync-folder-help"></p><div id="sync-proton-options" ${status.transport==='proton'?'':'hidden'}><label for="sync-remote">Pasta no Proton Drive · igual nos dois computadores</label><input id="sync-remote" type="text" value="${esc(status.remoteFolder||'/my-files/Trama')}" autocomplete="off"><label for="sync-cli">Caminho do Proton Drive CLI · opcional</label><input id="sync-cli" type="text" value="${esc(status.cliPath||'')}" placeholder="Deixe vazio se já estiver instalado no PATH" autocomplete="off"><p class="proof-note">Instale uma vez o <a href="https://proton.me/support/drive-cli" target="_blank" rel="noopener noreferrer">Proton Drive CLI oficial ↗</a>. Salve a configuração e entre pelo navegador do Proton. Sua senha não é pedida pelo Trama.</p><button class="secondary" type="button" id="sync-proton-login">Entrar no Proton</button><div id="sync-proton-state" class="proof-note" role="status"></div></div><p class="proof-note" data-sync-config-draft hidden>Configuração alterada nesta janela. Use Salvar configuração para aplicar; verificar não descarta este formulário.</p><div class="modal-actions"><button class="primary" type="submit">Salvar configuração</button></div></form></details>${status.configured?`<details class="sync-manual" ${needsChoice?'open':''}><summary>Versões disponíveis e controles manuais</summary><div class="feature-toolbar"><button class="secondary" id="sync-publish">Publicar cópia</button><a class="secondary" href="https://drive.proton.me/" target="_blank" rel="noopener noreferrer">Abrir Proton Drive ↗</a></div><p class="proof-note">Publicar grava uma cópia na pasta local de troca. No modo manual, o transporte é externo ao Trama. Com Proton direto automático, o envio acontece no próximo ciclo.</p><div class="sync-snapshots" data-sync-snapshots>${snapshotsHTML(status)}</div>${status.recovery?.length?`<details class="proof-setup"><summary>Cópias locais preservadas antes de receber versões</summary>${status.recovery.map(r=>`<p><code>${esc(r.path)}</code></p>`).join('')}</details>`:''}</details>`:''}${secondComputerHTML()}</section>`;
  }
  async function checkNow(button) {
    if(button)button.disabled=true;
    try{const out=await api('check',{});if(out.status)update(out.status);else await readStatus();ctx.toast(latest?.automatic?'Verificação solicitada. Acompanhe o resultado aqui.':'Verificação da pasta solicitada. Nenhuma versão será recebida automaticamente.');}
    catch(error){if(!error.status){connectionError=error.message;paintStatus();}ctx.toast(error.message);}
    finally{if(button?.isConnected)button.disabled=false;}
  }
  async function open() {
    releaseComparison();const request=++openRequest;
    ctx.modal('Sincronização entre computadores','<section data-sync-opening><p>Verificando a conexão local…</p></section>');
    const marker=$('[data-sync-opening]');
    try{
      const status=await readStatus();if(request!==openRequest||!marker?.isConnected||$('#modal')?.open===false)return;
      ctx.modal('Sincronização entre computadores',dialogHTML(status));
      const form=$('#sync-config');
      const transport=()=>{const direct=$('#sync-transport').value==='proton';$('#sync-proton-options').hidden=!direct;$('#sync-folder').required=!direct;$('#sync-transport-help').textContent=direct?'O Trama transfere cópias pelo CLI oficial em segundo plano. Requer instalação e login inicial.':'O aplicativo do Proton ou outro sincronizador cuida da nuvem. O Trama observa somente a pasta local.';$('#sync-folder-help').textContent=direct?'Vazio: o Trama cria a pasta local de troca. Uma pasta informada precisa existir e ser exclusiva para este grafo.':'Escolha uma pasta existente, exclusiva para este grafo e já sincronizada pelo aplicativo de sua preferência. O banco fica fora dela.';};transport();$('#sync-transport').onchange=transport;
      form.addEventListener('input',()=>{$('[data-sync-config-draft]').hidden=false;});
      form.onsubmit=async event=>{event.preventDefault();if(form.dataset.saving==='true')return;
        const body={folder:$('#sync-folder').value.trim(),automatic:$('#sync-automatic').checked,transport:$('#sync-transport').value,remoteFolder:$('#sync-remote').value.trim()||'/my-files/Trama',cliPath:$('#sync-cli').value.trim(),deviceName:$('#sync-device-name').value.trim()};
        const controls=[...form.querySelectorAll('input,select,textarea,button[type="submit"]')].map(element=>[element,element.disabled]);
        form.dataset.saving='true';form.setAttribute('aria-busy','true');for(const [element] of controls)element.disabled=true;
        try{await api('config',body);if(form.isConnected)await open();else void refresh();ctx.toast('Configuração de sincronização salva.');}
        catch(error){ctx.toast(error.message);}
        finally{if(form.isConnected){delete form.dataset.saving;form.removeAttribute('aria-busy');for(const [element,disabled] of controls)element.disabled=disabled;}}
      };
      $('#sync-proton-login').onclick=async()=>{const button=$('#sync-proton-login');button.disabled=true;try{const info=await api('proton/login',{cliPath:$('#sync-cli').value.trim()});if(button.isConnected)showLogin(info);}catch(error){ctx.toast(error.message);if(button.isConnected)button.disabled=false;}};
      if(status.transport==='proton'){const owner=$('#sync-proton-state');void api('proton/status').then(info=>{if(owner.isConnected)showLogin(info);}).catch(error=>{if(owner.isConnected)owner.textContent=error.message;});}
      const publish=$('#sync-publish');if(publish)publish.onclick=async()=>{publish.disabled=true;try{if(!await ctx.flush())throw Error('Salve as alterações pendentes antes de publicar.');const out=await api('publish',{revision:ctx.revision});await readStatus();ctx.toast(out.unchanged?'Esta versão já está publicada na pasta.':'Cópia publicada na pasta de troca.');}catch(error){ctx.toast(error.message);}finally{if(publish.isConnected)publish.disabled=false;}};
    }catch(error){if(marker?.isConnected)marker.innerHTML=`<p class="error-banner">${esc(error.message)}</p><p>Inicie o Trama novamente e mantenha esta janela aberta para preservar qualquer edição pendente.</p><div class="sync-quick-actions"><button class="secondary" data-sync-open>Tentar novamente</button><button class="secondary" data-sync-export>Baixar cópia desta janela</button></div>`;}
  }
  async function loadComparison(session) {
    if(!comparisonActive(session)||session.receiving)return;const request=++session.request;session.preview=null;session.element.innerHTML='<p>Salvando a edição desta janela e comparando as cópias…</p>';
    try{
      if(!await ctx.flush())throw Error('Salve as alterações pendentes antes de comparar. Você também pode baixar uma cópia desta janela.');
      if(!comparisonActive(session)||request!==session.request)return;
      const preview=await api('preview',{id:session.id,revision:ctx.revision});
      if(!comparisonActive(session)||request!==session.request)return;
      session.preview=preview;
      session.element.innerHTML=syncComparisonHTML(preview)+'<p class="error-banner" data-sync-preview-error hidden></p><div class="modal-actions"><button class="secondary" data-sync-open>Voltar</button><button class="secondary" data-sync-recompare>Comparar novamente</button><button class="primary" data-sync-confirm '+(preview.safeToReceive===false?'disabled':'')+'>Preservar cópia local e receber</button></div>';
    }catch(error){if(comparisonActive(session)&&request===session.request)session.element.innerHTML=`<p class="error-banner">${esc(error.message)}</p><div class="modal-actions"><button class="secondary" data-sync-open>Voltar</button><button class="secondary" data-sync-export>Baixar cópia desta janela</button><button class="primary" data-sync-recompare>Tentar comparar novamente</button></div>`;}
  }
  function compare(id) {
    if(!latest?.snapshots?.some(item=>item.id===id))return;
    releaseComparison();openRequest++;
    const session={id,key:'sync-preview-'+openRequest,preview:null,element:null,request:0,receiving:false};comparison=session;ctx.syncHold?.(session.key);
    ctx.modal('Comparar antes de receber','<section data-sync-comparison></section>');session.element=$('[data-sync-comparison]');void loadComparison(session);
  }
  async function receive(button) {
    const session=comparison,preview=session?.preview;if(!session||!preview||session.receiving||preview.safeToReceive===false||!comparisonActive(session))return;
    button.disabled=true;session.receiving=true;
    try{
      await api('receive',syncReceiveRequest(session.id,preview,local(),ctx.revision));
      await ctx.reloadData();
      if(comparisonActive(session))await open();else void refresh();
      ctx.toast('Versão recebida. Cópias anteriores preservadas.');
    }catch(error){if(comparisonActive(session)){session.preview=null;const message=session.element.querySelector('[data-sync-preview-error]');if(message){message.hidden=false;message.textContent=error.status===409?'As notas, a pasta ou a cópia escolhida mudaram. Compare novamente antes de receber. '+error.message:error.message;}}ctx.toast(error.message);}finally{session.receiving=false;}
  }
  document.addEventListener('click',event=>{
    const target=event.target;if(target.closest('[data-sync-open]')){event.preventDefault();void open();}
    const check=target.closest('[data-sync-check]');if(check){event.preventDefault();void checkNow(check);}
    const choice=target.closest('[data-sync-compare]');if(choice){event.preventDefault();compare(choice.dataset.syncCompare);}
    const confirm=target.closest('[data-sync-confirm]');if(confirm){event.preventDefault();void receive(confirm);}
    if(target.closest('[data-sync-recompare]')&&comparison){event.preventDefault();void loadComparison(comparison);}
    if(target.closest('[data-sync-export]')){event.preventDefault();ctx.download(`trama-notas-locais-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(ctx.data,null,2));ctx.toast('Cópia desta janela baixada. Ela inclui as notas ainda não salvas.');}
    if(target.closest('[data-sync-guide]')){event.preventDefault();const guide=$('#sync-second-computer');if(guide){guide.open=true;guide.scrollIntoView({block:'start',behavior:'smooth'});}}
  });
  $('#modal')?.addEventListener('close',()=>{openRequest++;releaseComparison();});
  const observer=typeof MutationObserver==='function'?new MutationObserver(()=>{if(comparison&&!comparison.element?.isConnected)releaseComparison();}):null;
  if($('#modal-content'))observer?.observe($('#modal-content'),{childList:true,subtree:true});
  const start=()=>{stopped=false;if(!interval)interval=setInterval(()=>{paintStatus();void refresh();},5000);void refresh();};start();
  return {open,refresh,start,stop(){stopped=true;clearInterval(interval);interval=null;openRequest++;statusRequest++;releaseComparison();}};
}
