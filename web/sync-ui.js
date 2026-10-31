import {escapeHTML as esc} from './renderer.js';

const STATE_LABELS={disabled:'Sincronização manual',waiting:'Aguardando sincronização',checking:'Verificando alterações…',idle:'Sincronização automática ativa',publishing:'Enviando alterações…',receiving:'Recebendo alterações…',conflict:'Versões divergentes: escolha necessária',choice_required:'Escolha a versão inicial',error:'Sincronização precisa de atenção'};
export function syncPresentation(status) {
  if(!status?.configured&&status?.auto?.state!=='error')return {state:'disabled',label:'Conectar outro computador',message:'Configure uma pasta de troca para sincronizar suas notas.'};
  const state=status.auto?.state||(status.conflict?'conflict':status.automatic?'waiting':'disabled');
  const folder=status.transport!=='proton';
  const label=state==='idle'&&folder?'Pasta local atualizada':STATE_LABELS[state]||'Sincronização';
  const message=(status.auto?.message||status.message||'')+(folder&&status.automatic?' O envio à nuvem depende do aplicativo Proton ou do sincronizador desta pasta.':'');
  return {state,label,message,lastSuccess:status.auto?.lastSuccess};
}
export function safeProtonLoginURL(value) {
  try {const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&['account.proton.me','account.protonmail.com'].includes(url.hostname)?url.href:null;}catch{return null;}
}
export function setupSync(ctx) {
  const $=s=>document.querySelector(s);let latest=null,refreshing=false,loginWaiting=false,openRequest=0;
  async function api(path,body) {
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try {const response=await fetch('/api/sync/'+path,{...(body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),signal:controller.signal});
      const out=await response.json();if(!response.ok)throw Error(out.error||'Não foi possível acessar a sincronização.');return out;
    } finally {clearTimeout(timer);}
  }
  function stateHTML(status) {
    const item=syncPresentation(status),warning=['conflict','choice_required','error'].includes(item.state);
    return `<div class="sync-status ${warning?'sync-conflict':''}" data-sync-state="${esc(item.state)}"><strong>${esc(item.label)}</strong><p>${esc(item.message)}</p>${item.lastSuccess?`<small>Última atividade concluída: ${esc(new Date(item.lastSuccess).toLocaleString('pt-BR'))}</small>`:''}${['conflict','choice_required'].includes(item.state)?'<p>As versões foram preservadas. Escolha abaixo qual grafo completo deseja usar. Os textos não são mesclados automaticamente.</p>':''}</div>`;
  }
  function snapshotsHTML(status) {
    return (status.snapshots||[]).map(item=>`<article class="sync-snapshot ${status.heads?.includes(item.id)?'sync-head':''}"><div><strong>${esc(item.deviceName||item.device)}</strong><small>${esc(new Date(item.created).toLocaleString('pt-BR'))} · ${esc(item.pages)} páginas · ${esc(item.blocks)} blocos ${item.id===status.base?'· base atual neste computador':''}${status.heads?.includes(item.id)?' · versão mais recente':''}</small></div><button class="secondary" data-sync-receive="${esc(item.id)}">Receber esta versão</button></article>`).join('')||'<p class="empty-state">Nenhuma cópia completa encontrada nesta pasta. No modo automático, aguarde a primeira transferência com o Trama aberto nos dois computadores.</p>';
  }
  function update(status) {
    latest=status;ctx.syncConfigured?.(status);const item=syncPresentation(status);
    document.querySelectorAll('[data-sync-indicator]').forEach(el=>{
      const label=el.querySelector('[data-sync-label]')||el;if(label.textContent!==item.label)label.textContent=item.label;
      el.dataset.syncState=item.state;el.title=item.message;el.setAttribute('aria-label',item.label+'. Abrir sincronização.');
    });
    const display=$('[data-sync-current]');if(display){const html=stateHTML(status);if(display.innerHTML!==html)display.innerHTML=html;}
    const list=$('[data-sync-snapshots]');if(list){const html=snapshotsHTML(status);if(list.innerHTML!==html)list.innerHTML=html;}
  }
  async function refresh() {
    if(refreshing)return;refreshing=true;
    try {update(await api('status'));if(loginWaiting&&$('#sync-proton-state'))showLogin(await api('proton/status'));}
    catch(error){document.querySelectorAll('[data-sync-indicator]').forEach(el=>{el.title=error.message;});}
    finally {refreshing=false;}
  }
  function showLogin(info) {
    loginWaiting=info.loginState==='waiting';const el=$('#sync-proton-state');if(!el)return;
    const link=safeProtonLoginURL(info.signInUrl);
    el.innerHTML=`<p>${esc(info.message||(info.installed?'Proton Drive CLI encontrado. Entre na sua conta uma vez.':'Instale o Proton Drive CLI oficial para usar esta opção.'))}</p>${link?`<a href="${esc(link)}" target="_blank" rel="noopener noreferrer">Continuar no login oficial do Proton ↗</a>`:''}`;
    el.dataset.loginState=info.loginState||'idle';const button=$('#sync-proton-login');if(button)button.disabled=loginWaiting;
  }
  async function open() {
    const request=++openRequest;
    try {
      const status=await api('status');if(request!==openRequest)return;update(status);
      ctx.modal('Sincronização entre computadores',`<div class="sync-intro"><p>Escreva aqui e continue no outro computador. Com a sincronização automática ativa nos dois, as notas aparecem automaticamente após a transferência, enquanto o Trama está aberto.</p></div><form id="sync-config"><label class="sync-toggle"><input id="sync-automatic" type="checkbox" ${status.automatic?'checked':''}><span><strong>Sincronização automática</strong><small>Envia notas salvas e recebe versões novas quando você não está digitando.</small></span></label><label for="sync-transport">Como transportar as notas</label><select id="sync-transport"><option value="folder" ${status.transport!=='proton'?'selected':''}>Pasta já sincronizada</option><option value="proton" ${status.transport==='proton'?'selected':''}>Proton direto</option></select><p class="proof-note" id="sync-transport-help"></p><label for="sync-folder">Pasta de troca neste computador</label><input id="sync-folder" type="text" value="${esc(status.folder||'')}" placeholder="C:\\Users\\você\\Proton Drive\\Trama ou /home/você/ProtonDrive/Trama" required><p class="proof-note" id="sync-folder-help"></p><div id="sync-proton-options" ${status.transport==='proton'?'':'hidden'}><label for="sync-remote">Pasta no Proton Drive · igual nos dois computadores</label><input id="sync-remote" type="text" value="${esc(status.remoteFolder||'/my-files/Trama')}" autocomplete="off"><label for="sync-cli">Caminho do Proton Drive CLI · opcional</label><input id="sync-cli" type="text" value="${esc(status.cliPath||'')}" placeholder="Deixe vazio se já estiver instalado no PATH" autocomplete="off"><p class="proof-note">Instale uma vez o <a href="https://proton.me/support/drive-cli" target="_blank" rel="noopener noreferrer">Proton Drive CLI oficial ↗</a>. Salve a configuração e entre pelo navegador do Proton. Sua senha não é pedida pelo Trama.</p><button class="secondary" type="button" id="sync-proton-login">Entrar no Proton</button><div id="sync-proton-state" class="proof-note" role="status"></div></div><div class="modal-actions"><button class="primary" type="submit">Salvar configuração</button></div></form><p class="sync-device">Este computador: ${esc(status.deviceName||status.device||'local')}</p><div data-sync-current aria-live="polite">${stateHTML(status)}</div>${status.configured?`<details class="sync-manual" ${status.conflict||['choice_required','conflict'].includes(status.auto?.state)?'open':''}><summary>Versões disponíveis e controles manuais</summary><div class="feature-toolbar"><button class="secondary" id="sync-publish">Publicar cópia</button><button class="secondary" data-sync-open>Verificar pasta</button><a class="secondary" href="https://drive.proton.me/" target="_blank" rel="noopener noreferrer">Abrir Proton Drive ↗</a></div><p class="proof-note">Publicar grava uma cópia na pasta de troca. No modo manual, conclua o transporte pelo Proton. Com o modo automático, o envio será feito no próximo ciclo.</p><div class="sync-snapshots" data-sync-snapshots>${snapshotsHTML(status)}</div>${status.recovery?.length?`<details class="proof-setup"><summary>Cópias locais preservadas antes de receber versões</summary>${status.recovery.map(r=>`<p><code>${esc(r.path)}</code></p>`).join('')}</details>`:''}</details>`:''}<details class="proof-setup"><summary>Configurar o segundo computador</summary><ol><li>Instale o Trama no outro computador e abra <strong>Sincronização</strong>. Se o grafo estiver vazio, não é necessário criar notas de exemplo.</li><li>Escolha a mesma pasta no Proton Drive. No modo <strong>Pasta já sincronizada</strong>, escolha a cópia local dessa pasta. No modo <strong>Proton direto</strong>, use o mesmo caminho remoto, como <code>/my-files/Trama</code>.</li><li>Ative a <strong>Sincronização automática</strong> nos dois computadores. No modo direto, entre na conta do Proton uma vez em cada computador.</li><li>Espere o envio terminar antes de mudar de computador. O atraso depende da conexão e do tamanho das notas; isto não é edição simultânea em tempo real.</li></ol><p>Se os dois computadores editarem a partir de versões diferentes, a sincronização pausa para você escolher uma versão. As alternativas são preservadas; textos divergentes não são combinados automaticamente. Nunca coloque <code>trama.db</code> na pasta sincronizada.</p></details>`);
      const transport=()=>{const direct=$('#sync-transport').value==='proton';$('#sync-proton-options').hidden=!direct;$('#sync-folder').required=!direct;$('#sync-transport-help').textContent=direct?'Windows e Linux: o Trama transfere cópias pelo CLI oficial em segundo plano. Requer instalação e login inicial.':'O aplicativo do Proton ou outro sincronizador cuida da nuvem. O Trama observa a pasta local e recebe as novas cópias; não confirma o estado da nuvem.';$('#sync-folder-help').textContent=direct?'Vazio: o Trama cria a pasta local de troca. Se informar uma pasta, ela precisa existir e ser exclusiva para este grafo.':'Escolha uma pasta existente, exclusiva para este grafo, já sincronizada pelo Proton ou outro aplicativo. O banco de notas continua fora dela.';};transport();$('#sync-transport').onchange=transport;
      $('#sync-config').onsubmit=async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;try{await api('config',{folder:$('#sync-folder').value.trim(),automatic:$('#sync-automatic').checked,transport:$('#sync-transport').value,remoteFolder:$('#sync-remote').value.trim()||'/my-files/Trama',cliPath:$('#sync-cli').value.trim()});await open();ctx.toast('Configuração de sincronização salva.');}catch(error){ctx.toast(error.message);button.disabled=false;}};
      $('#sync-proton-login').onclick=async()=>{const button=$('#sync-proton-login');button.disabled=true;try{showLogin(await api('proton/login',{cliPath:$('#sync-cli').value.trim()}));}catch(error){ctx.toast(error.message);button.disabled=false;}};
      if(status.transport==='proton')void api('proton/status').then(showLogin).catch(error=>{if($('#sync-proton-state'))$('#sync-proton-state').textContent=error.message;});
      if($('#sync-publish'))$('#sync-publish').onclick=async()=>{const button=$('#sync-publish');button.disabled=true;try{if(!await ctx.flush())throw Error('Salve as alterações pendentes antes de publicar.');const out=await api('publish',{revision:ctx.revision});await open();ctx.toast(out.unchanged?'Esta versão já está publicada na pasta.':'Cópia publicada na pasta de troca.');}catch(error){ctx.toast(error.message);button.disabled=false;}};
    }catch(error){ctx.toast(error.message);}
  }
  function confirmReceive(id) {
    const item=latest?.snapshots?.find(s=>s.id===id);if(!item)return;
    ctx.modal('Receber esta versão?',`<p>Usar a cópia de <strong>${esc(item.deviceName||item.device)}</strong>, de ${esc(new Date(item.created).toLocaleString('pt-BR'))}?</p><p>As notas atuais serão substituídas pelo conteúdo dessa cópia. Alterações locais ainda não publicadas serão preservadas em um arquivo de recuperação; o banco também recebe um backup.</p>${latest.conflict||latest.auto?.state==='choice_required'?'<p class="error-banner">Receber escolhe uma versão completa; não combina automaticamente textos editados nos dois computadores. As cópias alternativas continuam na pasta. A próxima publicação registra sua escolha.</p>':''}<div class="modal-actions"><button class="secondary" data-sync-open>Voltar</button><button class="primary" id="sync-receive-confirm">Preservar cópia local e receber</button></div>`);
    $('#sync-receive-confirm').onclick=async()=>{const button=$('#sync-receive-confirm');button.disabled=true;try{if(!await ctx.flush())throw Error('Salve as alterações pendentes antes de receber.');await api('receive',{revision:ctx.revision,id});await ctx.reloadData();await open();ctx.toast('Versão recebida. Cópias anteriores preservadas.');}catch(error){ctx.toast(error.message);button.disabled=false;}};
  }
  document.addEventListener('click',e=>{if(e.target.closest('[data-sync-open]')){e.preventDefault();void open();}const receive=e.target.closest('[data-sync-receive]');if(receive){e.preventDefault();confirmReceive(receive.dataset.syncReceive);}});
  let interval=null;const start=()=>{if(!interval)interval=setInterval(()=>void refresh(),5000);void refresh();};start();
  return {open,refresh,start,stop(){clearInterval(interval);interval=null;openRequest++;}};
}
