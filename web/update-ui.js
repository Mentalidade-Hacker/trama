import {escapeHTML as esc} from './renderer.js';

const STATES=new Set(['checking','downloading','ready','current','error','disabled','development']);
const VERSION=/^v?\d+\.\d+(?:\.\d+)?$/;
const RELEASES='https://github.com/Mentalidade-Hacker/trama/releases';
const bytes=value=>Number.isSafeInteger(value)&&value>=0?value:0;
const size=value=>`${(value/1024/1024).toLocaleString('pt-BR',{maximumFractionDigits:1})} MB`;
const version=value=>typeof value==='string'&&VERSION.test(value)?value.replace(/^v/,''):'—';
const date=value=>{const parsed=new Date(value);return value&&Number.isFinite(parsed.getTime())?parsed.toLocaleString('pt-BR'):null;};

/** Release links may only open published versions from this application's repository. */
export function safeUpdateReleaseURL(value) {
  try {
    const url=new URL(value);
    return url.protocol==='https:'&&url.hostname==='github.com'&&!url.port&&!url.username&&!url.password
      &&/^\/Mentalidade-Hacker\/trama\/releases\/(?:latest|tag\/v?\d+\.\d+(?:\.\d+)?)\/?$/i.test(url.pathname)
      &&!url.search&&!url.hash?url.href:null;
  } catch {return null;}
}

export function normalizeUpdateStatus(value) {
  if(!value||!STATES.has(value.state)||typeof value.automatic!=='boolean')throw Error('Não foi possível confirmar o estado das atualizações. Tente verificar novamente.');
  return {state:value.state,automatic:value.automatic,currentVersion:version(value.currentVersion),availableVersion:version(value.availableVersion),
    canClose:value.canClose===true,message:typeof value.message==='string'?value.message.slice(0,2000):'',
    downloadedBytes:bytes(value.downloadedBytes),totalBytes:bytes(value.totalBytes),releaseUrl:safeUpdateReleaseURL(value.releaseUrl),checkedAt:date(value.checkedAt)};
}

export function updatePresentation(status,connectionError='') {
  if(connectionError)return {state:'error',label:'Atualizações indisponíveis',message:connectionError};
  if(!status)return {state:'checking',label:'Consultando atualizações…',message:'Conferindo o estado do aplicativo neste computador.'};
  const labels={checking:'Verificando atualização…',downloading:'Baixando atualização…',ready:'Atualização pronta para instalar',current:'Trama atualizado',error:'Atualização precisa de atenção',disabled:'Download automático desligado',development:'Atualização indisponível nesta instalação'};
  const messages={checking:'Consultando as versões estáveis publicadas no GitHub.',downloading:'O download acontece em segundo plano. Você pode continuar escrevendo.',ready:'A atualização será aplicada na próxima inicialização do Trama.',current:'Você está usando a versão estável mais recente verificada.',error:'Não foi possível preparar a atualização. Tente verificar novamente.',disabled:'Use Verificar atualização para baixar uma nova versão quando quiser.',development:'Esta é uma instalação de desenvolvimento. Para receber atualizações por aqui, instale o pacote do Trama publicado no GitHub.'};
  const unchecked=status.state==='current'&&!status.checkedAt;
  return {state:status.state,label:unchecked?'Atualizações do Trama':labels[status.state],message:status.message||(unchecked?'A verificação de novas versões será feita em segundo plano.':messages[status.state])};
}

export function updateStatusHTML(status,connectionError='') {
  const item=updatePresentation(status,connectionError),total=status?.totalBytes||0,downloaded=status?.downloadedBytes||0;
  const progress=item.state==='downloading'?`<div class="update-progress"><progress aria-label="Download da atualização"${total?` max="${total}" value="${Math.min(downloaded,total)}"`:''}></progress><span>${total?`${esc(size(Math.min(downloaded,total)))} de ${esc(size(total))}`:`${esc(size(downloaded))} baixados · tamanho total ainda não informado`}</span></div>`:'';
  const ready=item.state==='ready'?`<div class="update-ready"><p>${status.canClose?'Use “Salvar e encerrar Trama” abaixo. Depois, abra o aplicativo novamente pelo atalho.':'Salve suas notas, encerre o Trama com Ctrl+C no terminal e abra novamente pelo atalho.'}</p><p>Antes de encerrar, confira também o salvamento nas outras janelas abertas do Trama.</p><p><strong>Fechar só a aba do navegador não encerra o Trama e não instala a atualização.</strong></p></div>`:'';
  return `<section class="update-status" data-update-state="${item.state}"><h3>${esc(item.label)}</h3><p>${esc(item.message)}</p>${progress}${ready}</section>`;
}

export function closeStatusHTML(status,connectionError='') {
  const error=connectionError?`<p class="update-error" role="alert">${esc(connectionError)}</p>`:'';
  return `<section class="update-status"><h3>Salvar e encerrar o aplicativo?</h3><p>As notas e os rascunhos desta janela serão salvos antes de encerrar.</p><p>Confira se as outras janelas do Trama também mostram que tudo está salvo.</p>${status?.state==='ready'?'<p>A atualização já baixada será aplicada quando você abrir novamente.</p>':''}${status?.canClose===false?'<p>Esta abertura não permite encerramento pelo painel. Salve suas notas e encerre com Ctrl+C no terminal.</p>':''}${error}</section>`;
}

/** No browser action installs code: the launcher applies an already verified package. */
export function setupUpdates(ctx) {
  const dialog=document.createElement('dialog');dialog.id='update-dialog';dialog.setAttribute('aria-labelledby','update-title');document.body.append(dialog);
  const $=selector=>dialog.querySelector(selector);
  let latest=null,connectionError='',notice='',noticeError=false,mutation=false,saving=false,closing=false,terminated=false,exitOnly=false;
  let stopped=true,requestEpoch=0,timer=null,reading=null,readController=null;

  async function request(path,body,signal) {
    const controller=new AbortController(),abort=()=>controller.abort(),timeout=setTimeout(()=>controller.abort(),15000);
    signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)controller.abort();
    try {
      const response=await fetch(path,{...(body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),signal:controller.signal});
      const result=await response.json();
      if(!response.ok)throw Error(result.error||'Não foi possível concluir esta ação. Tente novamente.');
      return result;
    } catch(error) {
      if(error.name==='AbortError')throw Error('O Trama demorou para responder. Verifique se o aplicativo continua aberto e tente novamente.');
      throw error;
    } finally {clearTimeout(timeout);signal?.removeEventListener('abort',abort);}
  }

  function schedule() {
    clearTimeout(timer);
    if(stopped||terminated||document.hidden)return;
    timer=setTimeout(()=>void refresh(),dialog.open||['checking','downloading'].includes(latest?.state)?3000:30000);
  }

  function paint() {
    const item=terminated?{state:'closed',label:'Trama encerrado',message:'Abra novamente pelo atalho quando quiser continuar.'}:updatePresentation(latest,connectionError);
    document.querySelectorAll('[data-app-close]').forEach(button=>{button.hidden=!latest?.canClose;button.disabled=terminated;});
    document.querySelectorAll('[data-update-indicator]').forEach(button=>{
      const label=button.querySelector('[data-update-label]')||button;
      const text=['checking','downloading','ready','error','closed'].includes(item.state)?item.label:'Atualizações';
      if(label.textContent!==text)label.textContent=text;
      button.dataset.updateState=item.state;button.title=item.message;button.setAttribute('aria-label',item.label+'. Abrir atualizações.');
    });
    if(!dialog.open||terminated)return;
    const display=$('[data-update-status]'),html=exitOnly?closeStatusHTML(latest,connectionError):updateStatusHTML(latest,connectionError);
    if(display&&display.innerHTML!==html)display.innerHTML=html;
    const blocked=mutation||saving||closing,development=latest?.state==='development',working=['checking','downloading'].includes(latest?.state)&&!connectionError;
    const automatic=$('[data-update-automatic]');automatic.disabled=blocked||development||!latest;if(!mutation)automatic.checked=latest?.automatic===true;
    $('[data-update-check]').disabled=blocked||development||working||(!latest&&!connectionError);
    $('[data-update-close]').disabled=closing;
    $('[data-update-save]').hidden=exitOnly||latest?.state!=='ready'||latest?.canClose===true;
    $('[data-update-exit]').hidden=(!exitOnly&&latest?.state!=='ready')||latest?.canClose!==true;
    $('[data-update-save]').disabled=blocked;$('[data-update-exit]').disabled=blocked||!!connectionError;
    $('[data-update-current]').textContent=latest?.currentVersion||'—';
    $('[data-update-available]').textContent=latest?.availableVersion!=='—'&&latest?.availableVersion?latest.availableVersion:'—';
    $('[data-update-checked]').textContent=latest?.checkedAt?`Última verificação: ${latest.checkedAt}`:'Nenhuma verificação concluída registrada.';
    const release=$('[data-update-release]');release.href=latest?.releaseUrl||RELEASES;release.textContent=latest?.releaseUrl?'Ver detalhes desta versão ↗':'Versões publicadas no GitHub ↗';
    const feedback=$('[data-update-feedback]');feedback.textContent=notice;feedback.classList.toggle('update-error',noticeError);feedback.setAttribute('role',noticeError?'alert':'status');
    dialog.setAttribute('aria-busy',String(blocked));
  }

  function accept(result) {latest=normalizeUpdateStatus(result.status||result);connectionError='';paint();}

  async function refresh() {
    if(stopped||terminated||mutation||closing){schedule();return;}
    if(reading)return reading;
    const token=++requestEpoch,controller=readController=new AbortController();
    const pending=(async()=>{
      try {const result=await request('/api/update/status',undefined,controller.signal);if(!stopped&&token===requestEpoch)accept(result);}
      catch(error){if(!stopped&&token===requestEpoch){connectionError=error.message;paint();}}
      finally{if(readController===controller)readController=null;}
    })();
    reading=pending;
    try {await pending;} finally {if(reading===pending)reading=null;schedule();}
  }

  async function change(action,body) {
    if(mutation||closing||saving||terminated||latest?.state==='development')return;
    mutation=true;notice='';noticeError=false;const token=++requestEpoch;
    readController?.abort();reading=null;paint();
    try {const result=await request('/api/update/'+action,body);if(!stopped&&token===requestEpoch){accept(result);notice=action==='settings'?'Preferência salva. Um pacote já pronto continua programado para a próxima inicialização.':'Verificação solicitada. Acompanhe o resultado neste painel.';}}
    catch(error){if(!stopped&&token===requestEpoch){notice=error.message;noticeError=true;}}
    finally{mutation=false;paint();schedule();}
  }

  async function flushNotes() {
    ctx.finishEditing?.();
    if(ctx.flushDrafts&&!await ctx.flushDrafts())throw Error('Há rascunhos ainda não confirmados no computador. Mantenha esta janela aberta e confira o aviso em Aprender.');
    if(!ctx.flush||!await ctx.flush())throw Error('Há notas ainda não salvas. Mantenha esta janela aberta e resolva o aviso de salvamento antes de encerrar.');
    const local=ctx.localState?.()||{};
    if(local.ready===false||local.dirty||local.saving||local.conflict)throw Error('Ainda há alterações desta janela sem confirmação. Resolva o aviso de salvamento antes de encerrar.');
  }

  async function saveBeforeClosing(exit=false) {
    if(saving||closing||mutation||terminated||(!exitOnly&&latest?.state!=='ready')||(exit&&!latest?.canClose))return;
    saving=true;closing=exit;notice='Confirmando o salvamento desta janela…';noticeError=false;paint();
    try {
      await flushNotes();
      if(exit) {
        if(!Number.isSafeInteger(ctx.revision)||typeof ctx.updateClientId!=='string'||!ctx.updateClientId)throw Error('Não foi possível identificar esta janela. Salve suas notas e tente novamente.');
        const result=await request('/api/app/close',{revision:ctx.revision,client:ctx.updateClientId});
        if(result.ok!==true)throw Error('O encerramento não foi confirmado. Mantenha esta janela aberta e tente novamente.');
        terminated=true;stop();
        dialog.innerHTML=`<header class="update-head"><div><p class="update-eyebrow">TRAMA</p><h2 id="update-title" tabindex="-1">Trama encerrado</h2></div></header><div class="update-body"><section class="update-status" data-update-state="ready" role="status" aria-live="polite"><h3>Suas alterações desta janela foram salvas</h3><p>Você pode fechar esta janela. ${latest.state==='ready'?'Abra novamente pelo atalho para aplicar a atualização.':'Abra novamente pelo atalho quando quiser continuar.'}</p><p>Recarregar esta página não inicia o aplicativo.</p></section></div>`;
        dialog.setAttribute('aria-busy','false');$('#update-title')?.focus();paint();
      } else notice='Salvamento desta janela confirmado. Confira também outras janelas abertas. Agora, encerre o Trama com Ctrl+C no terminal e abra novamente pelo atalho.';
    } catch(error){notice=error.message;noticeError=true;}
    finally{saving=false;closing=false;paint();}
  }

  function open(exit=false) {
    if(terminated)return;
    if(dialog.open&&exitOnly!==exit){if(closing||saving||mutation)return;dialog.close();}
    exitOnly=exit;
    if(!dialog.open) {
      dialog.innerHTML=`<header class="update-head"><div><p class="update-eyebrow">SEMPRE COM VOCÊ</p><h2 id="update-title">Atualizações do Trama</h2></div><button class="update-close" type="button" data-update-close aria-label="Fechar atualizações">✕</button></header><div class="update-body"><p class="update-intro">Baixe novas versões enquanto continua escrevendo. A instalação acontece quando você encerra e abre o Trama novamente.</p><dl class="update-versions"><div><dt>Neste computador</dt><dd data-update-current>—</dd></div><div><dt>Versão disponível</dt><dd data-update-available>—</dd></div></dl><div data-update-status role="status" aria-live="polite" aria-atomic="true"></div><label class="update-toggle"><input type="checkbox" data-update-automatic><span><strong>Baixar atualizações automaticamente</strong><small>Busca novas versões estáveis publicadas no GitHub. Desligar impede verificações automáticas futuras; um pacote já pronto ainda será instalado na próxima inicialização.</small></span></label><div class="update-actions"><button class="update-primary" type="button" data-update-check>Verificar atualização</button><button class="update-secondary" type="button" data-update-save hidden>Salvar notas antes de fechar</button><button class="update-secondary" type="button" data-update-exit hidden>Salvar e encerrar Trama</button></div><p class="update-feedback" data-update-feedback role="status" aria-live="polite"></p><p class="update-note">Suas notas, modelos de idioma e credenciais são preservados. Esta atualização é do aplicativo e não substitui o backup das suas notas.</p><div class="update-footer"><span data-update-checked></span><a data-update-release href="${RELEASES}" target="_blank" rel="noopener noreferrer">Versões publicadas no GitHub ↗</a></div></div>`;
      $('[data-update-close]').onclick=()=>{if(!closing&&!terminated)dialog.close();};
      $('[data-update-check]').onclick=()=>void (latest?change('check',{}):refresh());
      $('[data-update-automatic]').onchange=event=>void change('settings',{automatic:event.target.checked});
      $('[data-update-save]').onclick=()=>void saveBeforeClosing();
      $('[data-update-exit]').onclick=()=>void saveBeforeClosing(true);
      dialog.dataset.exitOnly=String(exitOnly);
      if(exitOnly){$('#update-title').textContent='Encerrar Trama';$('[data-update-close]').setAttribute('aria-label','Cancelar encerramento');}
      dialog.showModal();
    }
    paint();start();
  }
  function start(){if(terminated)return;stopped=false;void refresh();}
  function stop(){stopped=true;requestEpoch++;clearTimeout(timer);timer=null;readController?.abort();readController=null;reading=null;}
  dialog.addEventListener('cancel',event=>{if(closing||terminated)event.preventDefault();});
  dialog.addEventListener('close',()=>schedule());
  dialog.addEventListener('keydown',event=>event.stopPropagation());
  dialog.addEventListener('click',event=>event.stopPropagation());
  document.addEventListener('click',event=>{if(event.target.closest('[data-app-close]')){event.preventDefault();open(true);}else if(event.target.closest('[data-update-open]')){event.preventDefault();open();}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(timer);timer=null;}else start();});
  window.addEventListener('pagehide',stop);window.addEventListener('pageshow',event=>{if(event.persisted)start();});
  start();
  if(new URLSearchParams(window.location?.search||'').get('trama-action')==='close')open(true);
  return {open,openExit:()=>open(true),start,stop,refresh,dialog};
}
