import {escapeHTML as esc} from './renderer.js';

const MAX_ARCHIVE=260*1024*1024;
const LANGUAGES=['pt-BR','pt-PT','en-US','en-GB'];
const PREF_KEYS={theme:'trama-theme',textSize:'trama-text-size',proofLanguage:'trama-proof-language',liveWriting:'trama-live-writing',vocabularyHints:'trama-vocabulary-hints',acceptedWords:'trama-spell-ignored',favorites:'trama-favorites',recent:'trama-recent'};
const RECEIPT='trama-full-backup-result';
const browserStorage=()=>{try{return localStorage;}catch{return null;}};
const idOK=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value);
const sizeLabel=bytes=>bytes<1024*1024?`${Math.ceil(bytes/1024)} KB`:`${(bytes/1024/1024).toLocaleString('pt-BR',{maximumFractionDigits:1})} MB`;
const dateLabel=value=>{const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleString('pt-BR'):'data indisponível';};

/** Only preferences named here can cross the backup boundary. */
export function readBackupPreferences(storage) {
  // Include effective defaults too: an unset light theme must restore as light
  // even when the destination browser previously selected dark.
  const result={theme:'light',textSize:100,proofLanguage:'pt-BR',liveWriting:true,vocabularyHints:false,acceptedWords:{},favorites:[],recent:[]};
  const get=key=>{try{return storage.getItem(PREF_KEYS[key]);}catch{return null;}};
  const parsed=key=>{try{return JSON.parse(get(key));}catch{return null;}};
  const theme=get('theme');if(['light','dark','system'].includes(theme))result.theme=theme;
  const size=Number(get('textSize'));if(Number.isInteger(size)&&size>=80&&size<=200)result.textSize=size;
  const language=get('proofLanguage');if(LANGUAGES.includes(language))result.proofLanguage=language;
  for(const name of ['liveWriting','vocabularyHints']){const value=get(name);if(['on','off'].includes(value))result[name]=value==='on';}
  for(const [key,limit] of [['favorites',5000],['recent',20]]){const ids=parsed(key);if(Array.isArray(ids))result[key]=ids.filter(idOK).slice(0,limit);}
  const words=parsed('acceptedWords');
  if(words&&typeof words==='object'&&!Array.isArray(words)){
    result.acceptedWords={};
    for(const language of LANGUAGES)if(Array.isArray(words[language]))result.acceptedWords[language]=words[language].filter(word=>typeof word==='string'&&word.length>0&&word.length<=200&&!/[\u0000-\u001f]/.test(word)).slice(0,5000);
  }
  return result;
}

export function applyBackupPreferences(storage,value) {
  let failed=false;
  // Server validation is authoritative. Reading through the same allowlist also
  // prevents a malformed response from writing unrelated browser keys.
  const safe=readBackupPreferences({getItem(key){const name=Object.keys(PREF_KEYS).find(name=>PREF_KEYS[name]===key);if(!Object.hasOwn(value||{},name))return null;const item=value[name];return ['liveWriting','vocabularyHints'].includes(name)?(item===true?'on':item===false?'off':null):['acceptedWords','favorites','recent'].includes(name)?JSON.stringify(item):String(item);}});
  for(const [name,item] of Object.entries(safe))if(Object.hasOwn(value||{},name))try{storage.setItem(PREF_KEYS[name],['liveWriting','vocabularyHints'].includes(name)?(item?'on':'off'):typeof item==='object'?JSON.stringify(item):String(item));}catch{failed=true;}
  return !failed;
}

export function backupSummaryHTML(summary) {
  const number=value=>Number.isSafeInteger(value)&&value>=0?String(value):'—';
  return `<p class="backup-created">Criado em ${esc(dateLabel(summary.created))}</p><dl class="backup-counts">${[['Páginas','pages'],['Blocos','blocks'],['Anexos','attachments'],['Revisões no histórico','history'],['Rascunhos de estudo','drafts']].map(([label,key])=>`<div><dt>${label}</dt><dd>${number(summary[key])}</dd></div>`).join('')}</dl><p class="backup-note">Anexos: ${esc(sizeLabel(Number.isFinite(summary.attachmentBytes)?summary.attachmentBytes:0))}. O histórico conserva sua ordem; os números de revisão serão ajustados neste computador.</p>`;
}

export function setupBackup(ctx) {
  const dialog=document.createElement('dialog');dialog.id='backup-dialog';dialog.setAttribute('aria-labelledby','backup-title');document.body.append(dialog);
  let sequence=0,busy=false,restoring=false,selected=null,preview=null,controller=null,held=false;
  const $=selector=>dialog.querySelector(selector);
  const hold=()=>{if(!held){held=true;ctx.syncHold?.(dialog);}};
  const release=()=>{if(held){held=false;ctx.syncRelease?.(dialog);}};
  const message=(text,error=false)=>{const box=$('[data-backup-message]');if(box){box.textContent=text;box.classList.toggle('backup-error',error);box.setAttribute('role',error?'alert':'status');}};
  const setBusy=(value,isRestore=false)=>{busy=value;restoring=value&&isRestore;dialog.setAttribute('aria-busy',String(value));dialog.querySelectorAll('button,input').forEach(node=>{node.disabled=value;});};
  const ready=async()=>{if(ctx.flushDrafts&&!await ctx.flushDrafts())throw Error('Há rascunhos de estudo ainda não salvos. Volte à aprendizagem e resolva o aviso antes de continuar.');if(!await ctx.flush())throw Error('Há notas ainda não salvas. Resolva o aviso de salvamento antes de continuar.');const local=ctx.localState?.()||{};if(local.dirty||local.saving||local.conflict||local.ready===false)throw Error('As alterações desta janela precisam ser salvas antes de continuar.');};
  async function request(action,payload,{binary=false,signal}={}) {
    const response=await fetch(`/api/full-backup/${action}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal});
    if(!response.ok){let data;try{data=await response.json();}catch{}const error=Error(data?.error||`Não foi possível concluir o backup (${response.status}).`);error.status=response.status;error.code=data?.code;throw error;}
    return binary?response.blob():response.json();
  }
  function saveBlob(blob,name){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
  function fileData(file,signal){return new Promise((resolve,reject)=>{const reader=new FileReader();const abort=()=>reader.abort();reader.onerror=()=>reject(Error('Não foi possível ler este arquivo.'));reader.onabort=()=>reject(new DOMException('Leitura cancelada','AbortError'));reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onloadend=()=>signal.removeEventListener('abort',abort);signal.addEventListener('abort',abort,{once:true});reader.readAsDataURL(file);});}
  function cancelWork(){sequence++;controller?.abort();controller=null;selected=null;preview=null;busy=false;release();}
  function close(){if(restoring)return;dialog.close();}
  dialog.addEventListener('close',cancelWork);
  dialog.addEventListener('cancel',event=>{if(restoring)event.preventDefault();});
  dialog.addEventListener('keydown',event=>event.stopPropagation());
  dialog.addEventListener('click',event=>{event.stopPropagation();if(event.target.closest('[data-backup-close]'))close();});
  window.addEventListener('beforeunload',event=>{if(restoring){event.preventDefault();event.returnValue='';}});
  function shell(body){dialog.innerHTML=`<header class="backup-head"><div><p>SEUS DADOS, COM VOCÊ</p><h2 id="backup-title">Backup completo</h2></div><button type="button" data-backup-close aria-label="Fechar backup">✕</button></header><div class="backup-body">${body}<p data-backup-message role="status" aria-live="polite"></p></div>`;}
  function open(){
    if(restoring)return;cancelWork();hold();
    const main=document.querySelector('#modal');if(main?.open)main.close();
    shell(`<p>Guarde notas, anexos, histórico e rascunhos de estudo em um único arquivo. Ele pode ser restaurado no Windows ou no Linux.</p><section class="backup-section"><div class="backup-step">01 · GUARDAR</div><h3>Levar uma cópia com você</h3><p>Inclui aparência, idioma e palavras aceitas deste navegador. Credenciais, programas instalados e caminhos deste computador ficam fora.</p><button class="backup-primary" data-backup-export>Baixar backup completo</button><p class="backup-note">O arquivo contém suas notas e não tem senha. Guarde-o em um local privado. Limite: 256 MB de conteúdo, até 5.000 anexos e o histórico disponível de até 100 revisões.</p></section><section class="backup-section"><div class="backup-step">02 · RECUPERAR</div><h3>Restaurar uma cópia</h3><p>Primeiro, confira o conteúdo. A restauração só começa depois da sua confirmação e guarda uma cópia completa do estado atual.</p><label class="backup-file">Arquivo de backup completo (.zip)<input type="file" accept=".zip,application/zip" data-backup-file></label><p class="backup-note">Este formato é diferente da exportação de notas ou do cofre antigo.</p><div data-backup-preview></div></section>`);
    if(!dialog.open)dialog.showModal();dialog.scrollTop=0;
    $('[data-backup-export]').onclick=download;
    $('[data-backup-file]').onchange=()=>{selected=$('[data-backup-file]').files[0]||null;preview=null;if(selected)void inspect();};
  }
  async function download(){
    if(busy)return;const owner=++sequence;controller=new AbortController();setBusy(true);message('Salvando as alterações e preparando o arquivo…');
    try{await ready();if(owner!==sequence)return;const blob=await request('export',{preferences:readBackupPreferences(browserStorage())},{binary:true,signal:controller.signal});if(owner!==sequence)return;saveBlob(blob,`trama-backup-${new Date().toISOString().slice(0,10)}.zip`);message('Arquivo preparado. Confira o download no seu navegador.');}
    catch(error){if(owner===sequence&&error.name!=='AbortError')message(error.message,true);}
    finally{if(owner===sequence)setBusy(false);}
  }
  async function inspect(){
    if(busy||!selected)return;const owner=++sequence;controller=new AbortController();preview=null;setBusy(true);message('Salvando as alterações e verificando a integridade do backup…');$('[data-backup-preview]').innerHTML='';
    try{
      if(selected.size>MAX_ARCHIVE)throw Error('O arquivo excede 260 MB. Escolha um backup completo dentro do limite.');
      await ready();if(owner!==sequence)return;
      const data=await fileData(selected,controller.signal);if(owner!==sequence)return;
      const inspected=await request('inspect',{data,revision:ctx.revision},{signal:controller.signal});if(owner!==sequence)return;
      preview={...inspected,data};
      $('[data-backup-preview]').innerHTML=`<section class="backup-preview"><h4>Confira antes de restaurar</h4><p class="backup-filename">${esc(selected.name)}</p>${backupSummaryHTML(inspected.summary)}<div class="backup-warning"><strong>O conteúdo atual será substituído.</strong><p>Notas, anexos, histórico e rascunhos serão os desta cópia. A sincronização ficará desligada e desconectada; configure-a novamente depois de conferir o resultado.</p><p>A cópia anterior será guardada neste computador e terá um link para download.</p></div><label class="backup-check"><input type="checkbox" data-backup-preferences checked>Restaurar também a aparência e as preferências deste navegador</label><div class="backup-actions"><button class="backup-primary" data-backup-restore>Criar cópia atual e restaurar</button><button class="backup-secondary" data-backup-reinspect>Verificar novamente</button></div></section>`;
      $('[data-backup-restore]').onclick=restore;$('[data-backup-reinspect]').onclick=inspect;message('Integridade verificada. Nenhuma nota foi alterada.');
    }catch(error){if(owner===sequence&&error.name!=='AbortError'){message(error.message,true);$('[data-backup-preview]').innerHTML='<button class="backup-secondary" data-backup-reinspect>Tentar verificar novamente</button>';$('[data-backup-reinspect]').onclick=inspect;}}
    finally{if(owner===sequence)setBusy(false);}
  }
  async function restore(){
    if(busy||!preview)return;const owner=++sequence,chosen=preview,restorePreferences=$('[data-backup-preferences]').checked;
    setBusy(true,true);message('Guardando a cópia atual e restaurando o backup. Aguarde a conclusão…');
    try{
      await ready();
      const result=await request('restore',{data:chosen.data,inspection:chosen.inspection,revision:ctx.revision,preferencesBefore:readBackupPreferences(browserStorage())});
      if(owner!==sequence)return;
      let preferencesSaved=true;if(restorePreferences)preferencesSaved=applyBackupPreferences(browserStorage(),result.preferences);
      const receipt={id:result.recoveryId,path:result.recoveryPath,preferencesSaved};
      try{sessionStorage.setItem(RECEIPT,JSON.stringify(receipt));}catch{}
      document.dispatchEvent(new CustomEvent('trama:backup-restored',{bubbles:true,detail:{revision:result.revision}}));
      // Reset graph undo, learning draft epochs and browser preference caches.
      restoring=false;location.reload();
    }catch(error){if(owner===sequence){preview=null;const area=$('[data-backup-preview]');area.innerHTML='<p>Confira o estado atual antes de tentar novamente. A cópia anterior, quando criada, permanece na pasta full-backups dos dados do Trama.</p><button class="backup-secondary" data-backup-reinspect>Inspecionar novamente</button>';$('[data-backup-reinspect]').onclick=inspect;message(error.status===409?'O estado atual mudou desde a verificação. Inspecione novamente para confirmar a nova situação.':`${error.message} Se a conexão caiu durante a restauração, recarregue a página antes de continuar.`,true);}}
    finally{if(owner===sequence)setBusy(false);}
  }
  function receipt(){
    let value;try{value=JSON.parse(sessionStorage.getItem(RECEIPT));sessionStorage.removeItem(RECEIPT);}catch{return;}
    if(!value||typeof value.id!=='string'||!/^[a-f0-9]{32}$/.test(value.id))return;
    hold();shell(`<section class="backup-complete"><div class="backup-step">RESTAURAÇÃO CONCLUÍDA</div><h3>Seu backup está aberto</h3><p>Notas, anexos, histórico e rascunhos foram restaurados. A sincronização está desligada. Confira seu conteúdo antes de conectar outro computador.</p><a class="backup-primary" href="/api/full-backup/recovery/${value.id}" download="trama-copia-anterior.zip">Baixar a cópia anterior</a><p class="backup-note">A cópia anterior também está guardada neste computador:</p><code>${esc(typeof value.path==='string'?value.path:'Pasta full-backups dos dados do Trama')}</code>${value.preferencesSaved===false?'<p class="backup-error">O navegador não permitiu guardar todas as preferências de aparência. As notas foram restauradas.</p>':''}<div class="backup-actions"><button class="backup-secondary" data-backup-close>Conferir minhas notas</button></div></section>`);dialog.showModal();
  }
  document.addEventListener('click',event=>{if(event.target.closest('[data-full-backup-open]')){event.preventDefault();void open();}});
  receipt();
  return {open};
}
