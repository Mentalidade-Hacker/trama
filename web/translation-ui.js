import * as C from './core.js';
import {prepareTranslation, restoreTranslation, saveTranslatedCopy, addVocabularyCard, validateTranslationText} from './translation-core.js';
import {maskMarkup, applySuggestion, isProtectedRange} from './proofread.js';
import {translationPracticeLesson, translationDraftSession, TRANSLATION_PRACTICE_LIMIT} from './translation-drafts.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const languages = {pt:'Português', en:'English'};
const vocabularyTitle = 'Vocabulário · Português e English';
const readable = text => esc(text)
  .replace(/\[([^\]\n]+)\]\(\[\[([^\]\n]+)\]\]\)/g,'<span class="study-link" title="Página: $2">$1</span>')
  .replace(/\[([^\]\n]+)\]\(\(\(([^)]+)\)\)\)/g,'<span class="study-link" title="Referência: $2">$1</span>')
  .replace(/\[\[([^\]\n]+)\]\]/g,'<span class="study-link">$1</span>')
  .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/__([^_]+)__/g,'<em>$1</em>');

export function setupTranslation(ctx) {
  const dialog = document.createElement('dialog');
  dialog.id = 'translation-dialog';
  dialog.setAttribute('aria-label','Tradução e prática de escrita');
  document.body.append(dialog);
  let session = null, sequence = 0, practiceSequence = 0, controller = null, cache = new Map(), activePractice = null;
  const drafts = ctx.learningDrafts;
  const $ = selector => dialog.querySelector(selector);

  function stop() { captureDraft(); sequence++; practiceSequence++; controller?.abort(); controller=null; }
  function updateDraftStatus(error='') {
    const label=$('#practice-draft-status');
    if(label && activePractice)label.textContent=error || (activePractice.draft.archived ? 'O banco de notas mudou. Esta tentativa está nas cópias anteriores em Aprender → Retomar um rascunho. Uma nova edição cria outro rascunho.' : activePractice.draft.current() ? drafts.status().message : 'Escreva sua tentativa para começar o rascunho.');
  }
  function captureDraft({input=false}={}) {
    const field=$('#practice-attempt');
    if(!field || !activePractice)return null;
    try { const row=activePractice.draft.capture(field.value,{input});updateDraftStatus();return row; }
    catch(error) { updateDraftStatus(error.message);return null; }
  }
  drafts.subscribe(()=>updateDraftStatus());
  dialog.addEventListener('close',()=>{stop();void drafts.flush();activePractice=null;});
  window.addEventListener('pagehide',()=>{captureDraft();void drafts.flush();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){captureDraft();void drafts.flush();}});
  // Keep note editor shortcuts from changing the graph while practicing.
  dialog.addEventListener('keydown',event=>event.stopPropagation());
  dialog.addEventListener('click',event=>event.stopPropagation());

  function shell(target, pageTitle) {
    dialog.innerHTML = `<header class="translation-head"><div><span class="translation-eyebrow">LER · ESCREVER · APRENDER</span><h2>Seu texto em ${target==='pt'?'português':'inglês'}</h2><p>${esc(pageTitle)}</p></div><button id="translation-close" aria-label="Fechar tradução">✕</button></header><div class="translation-body"><div class="translation-direction"><span>${languages[target==='pt'?'en':'pt']} → ${languages[target]}</span><button class="secondary" id="translation-invert">Traduzir para ${languages[target==='pt'?'en':'pt']}</button><button class="secondary" id="translation-vocabulary">Meu vocabulário</button></div><p class="translation-note">A tradução mantém a página original. Os rótulos dos links podem ser traduzidos, mantendo o destino original. Referências, código, comandos, anexos e conteúdo de outras páginas não são traduzidos.</p><div id="translation-status" role="status" aria-live="polite"></div><div id="translation-result"></div></div>`;
    $('#translation-close').onclick=()=>dialog.close();
    $('#translation-invert').onclick=()=>open(target==='pt'?'en':'pt');
    $('#translation-vocabulary').onclick=openVocabulary;
    if(!dialog.open)dialog.showModal();
  }

  function installHelp(status) {
    return `<section class="translation-setup"><h3>Ativar a tradução local</h3><p>Baixe o motor e os dois modelos uma vez. Depois disso, as traduções funcionam sem internet e suas notas ficam neste computador.</p><p><strong>Windows:</strong> abra <code>setup-translation.cmd</code> na pasta do Trama.<br><strong>Arch Linux:</strong> execute <code>bash setup-translation.sh</code>.</p>${status?.home?`<p class="translation-note">Pasta dos modelos neste grafo: <code>${esc(status.home)}</code>. Se usa uma pasta de dados personalizada, consulte TRANSLATION.md.</p>`:''}<p class="translation-note">O download pode ser grande. A velocidade e a qualidade dependem dos modelos e do computador. O guia TRANSLATION.md acompanha o aplicativo.</p><button class="primary" id="translation-retry">Verificar e traduzir novamente</button></section>`;
  }

  async function request(texts, source, target, signal) {
    const response=await fetch('/api/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source,target,texts}),signal});
    const result=await response.json();
    if(!response.ok)throw Error(result.error||'Não foi possível traduzir.');
    if(!Array.isArray(result.texts)||result.texts.length!==texts.length||result.texts.some(text=>typeof text!=='string'))throw Error('O tradutor retornou uma resposta incompleta.');
    return result.texts;
  }

  async function open(target) {
    if(!languages[target])return;
    const page=ctx.page;
    if(!page){ctx.toast('Abra uma página para traduzir.');return;}
    stop();ctx.finishEditing();activePractice=null;
    const token=sequence;
    session={target,source:target==='pt'?'en':'pt',prepared:prepareTranslation(page),translated:null,saved:false,cards:new Map(),lessons:new Map()};
    const working=session;
    shell(target,page.title);
    $('#translation-status').textContent='Verificando o tradutor local…';
    controller=new AbortController();
    const signal=controller.signal;
    try {
      const key=target+'|'+working.prepared.snapshot;
      if(cache.has(key))working.translated=cache.get(key);
      else {
        const response=await fetch('/api/translate/status',{signal});
        const status=await response.json();
        if(!response.ok)throw Error(status.error||'Não foi possível consultar o tradutor.');
        if(token!==sequence)return;
        if(!status.available){$('#translation-status').innerHTML=`<p>${esc(status.message||'Os modelos de tradução ainda não estão instalados.')}</p>${installHelp(status)}`;$('#translation-retry').onclick=()=>open(target);return;}
        const translated=[]; const texts=working.prepared.texts;
        while(translated.length<texts.length) {
          const start=translated.length,batch=[];let chars=0;
          while(start+batch.length<texts.length&&batch.length<40) {
            const text=texts[start+batch.length];
            if(batch.length&&chars+text.length>6000)break;
            batch.push(text);chars+=text.length;
          }
          $('#translation-status').innerHTML=`<div class="translation-progress"><span>Traduzindo a página no seu computador… ${start} de ${texts.length} trechos</span><progress value="${start}" max="${texts.length}"></progress><button class="secondary" id="translation-cancel">Cancelar</button></div>`;
          $('#translation-cancel').onclick=()=>{stop();$('#translation-status').innerHTML='<p>Tradução cancelada. A página original está preservada.</p><button class="secondary" id="translation-retry">Tentar novamente</button>';$('#translation-retry').onclick=()=>open(target);};
          translated.push(...await request(batch,working.source,target,signal));
          if(token!==sequence)return;
        }
        // Validate all parts before showing or offering to save any result.
        restoreTranslation(working.prepared,translated);
        working.translated=translated;cache.set(key,translated);
        if(cache.size>8)cache.delete(cache.keys().next().value);
      }
      if(token!==sequence)return;
      $('#translation-status').innerHTML='<p class="translation-ready">✓ Tradução pronta · original preservado</p>';
      showResult();
    } catch(error) {
      if(token!==sequence||error.name==='AbortError')return;
      $('#translation-status').innerHTML=`<p class="error-banner">${esc(error.message)}</p><button class="secondary" id="translation-retry">Tentar novamente</button>`;
      $('#translation-retry').onclick=()=>open(target);
    }
  }

  function showResult() {
    const translated=restoreTranslation(session.prepared,session.translated);
    const original=session.prepared.page;
    const left=C.walkBlocks([original]),right=C.walkBlocks([translated]);
    session.rows=left.map((entry,index)=>({original:entry.block.text,translation:right[index].block.text,id:entry.block.id,depth:entry.depth}));
    $('#translation-result').innerHTML=`<div class="translation-actions"><div role="group" aria-label="Modo de leitura"><button class="secondary selected" data-reading="both" aria-pressed="true">Lado a lado</button><button class="secondary" data-reading="translated" aria-pressed="false">Só tradução</button></div><button class="primary" id="translation-save">Salvar como nova página</button></div><p class="translation-note">Tradução automática para estudo. Pode haver outras formas corretas de dizer a mesma coisa. Use “Praticar escrita” para tentar antes de comparar.</p><div id="translation-practice" hidden></div><section class="translation-reading"><div class="translation-row translation-titles"><div class="translation-original"><span>${languages[session.source]} · ORIGINAL</span><h3>${esc(original.title)}</h3></div><div><span>${languages[session.target]} · TRADUÇÃO</span><h3 lang="${session.target}">${esc(translated.title)}</h3></div></div>${session.rows.map((row,index)=>`<article class="translation-row" style="--depth:${Math.min(row.depth,10)}"><div class="translation-original study-prose" lang="${session.source}">${readable(row.original)||'<span class="translation-note">Bloco vazio</span>'}</div><div><div class="study-prose" lang="${session.target}">${readable(row.translation)||'<span class="translation-note">Bloco vazio</span>'}</div>${maskMarkup(row.original).trim()?`<div class="study-row-actions"><button class="secondary" data-practice="${index}">Praticar escrita</button><button class="secondary" data-save-vocab="${index}">Guardar frase</button></div>`:''}</div></article>`).join('')}</section><section class="study-word-box"><h3>Uma palavra ou expressão para lembrar</h3><p>Busque uma expressão que apareceu no texto e guarde o par no seu vocabulário.</p><div class="study-word-fields"><label>Expressão em ${languages[session.source]}<textarea id="study-word-original" rows="2" maxlength="1000" lang="${session.source}" placeholder="Escreva uma palavra ou expressão"></textarea></label><label>Em ${languages[session.target]}<textarea id="study-word-translation" rows="2" maxlength="2000" lang="${session.target}" placeholder="Tradução ou anotação pessoal"></textarea></label></div><div class="study-row-actions"><button class="secondary" id="study-word-translate">Traduzir expressão</button><button class="primary" id="study-word-save">Guardar no vocabulário</button></div><p id="study-word-status" role="status"></p></section>`;
    dialog.querySelectorAll('[data-reading]').forEach(button=>button.onclick=()=>{
      $('.translation-reading').classList.toggle('translation-only',button.dataset.reading==='translated');
      dialog.querySelectorAll('[data-reading]').forEach(item=>{const active=item===button;item.classList.toggle('selected',active);item.setAttribute('aria-pressed',String(active));});
    });
    $('#translation-save').onclick=async()=>{
      if(session.saved)return;
      try {ctx.checkpoint();const page=saveTranslatedCopy(ctx.data,session.prepared,session.translated,{language:session.target});ctx.changed(page.id);ctx.render();session.saved=true;$('#translation-save').textContent='Cópia criada';$('#translation-save').disabled=true;const link=document.createElement('button');link.className='secondary';link.textContent='Abrir cópia';link.onclick=()=>{dialog.close();ctx.openPage(page.title);};$('#translation-save').after(link);if(!await ctx.flush())throw Error('A cópia foi criada na memória, mas ainda não foi salva no disco. Confira o indicador de salvamento.');ctx.toast('Tradução salva como nova página. O original foi mantido.');}
      catch(error){ctx.toast(error.message);}
    };
    dialog.querySelectorAll('[data-save-vocab]').forEach(button=>button.onclick=async()=>{button.disabled=true;const row=session.rows[Number(button.dataset.saveVocab)],result=await saveVocabulary(row.original,row.translation,row.id);if(result)button.textContent=result==='saved'?'Frase guardada':'Cartão criado · salvamento pendente';else button.disabled=false;});
    dialog.querySelectorAll('[data-practice]').forEach(button=>button.onclick=()=>practice(Number(button.dataset.practice)).catch(error=>ctx.toast(error.message)));
    $('#study-word-translate').onclick=translateWord;
    $('#study-word-save').onclick=async()=>{const button=$('#study-word-save');button.disabled=true;const result=await saveVocabulary($('#study-word-original').value,$('#study-word-translation').value);if(result)$('#study-word-status').textContent=result==='saved'?'✓ Expressão guardada no seu vocabulário.':'Cartão criado; confira o aviso de salvamento antes de fechar.';else button.disabled=false;};
    for(const field of ['#study-word-original','#study-word-translation'])$(field).oninput=()=>{$('#study-word-save').disabled=false;};
  }

  async function saveVocabulary(original,translation,blockId) {
    let created=false;
    try {
      if(!original.trim()||!translation.trim())throw Error('Preencha o texto original e a tradução.');
      const key=JSON.stringify([original.trim(),translation.trim(),blockId||'']);
      if(!session.cards.has(key)){ctx.checkpoint();const {page,block}=addVocabularyCard(ctx.data,{original,translation,sourcePageId:session.prepared.pageId,sourceTitle:session.prepared.page.title,sourceBlockId:blockId,sourceLanguage:session.source,targetLanguage:session.target});session.cards.set(key,block.id);ctx.changed(page.id);ctx.render();}
      created=true;if(!await ctx.flush())throw Error('O cartão foi criado na memória, mas não foi salvo no disco. Confira o indicador de salvamento.');ctx.toast('Adicionado ao seu vocabulário.');return 'saved';
    } catch(error){ctx.toast(error.message);return created?'pending':null;}
  }

  async function translateWord() {
    const input=$('#study-word-original').value.trim(),previousTranslation=$('#study-word-translation').value,token=sequence,button=$('#study-word-translate');
    if(!input){$('#study-word-status').textContent='Escreva uma palavra ou expressão primeiro.';return;}
    button.disabled=true;$('#study-word-status').textContent='Traduzindo a expressão…';
    try {
      const result=await request([input],session.source,session.target,controller?.signal);
      if(token!==sequence)return;
      if($('#study-word-original').value.trim()!==input||$('#study-word-translation').value!==previousTranslation){$('#study-word-status').textContent='Você editou os campos durante a consulta. Traduza novamente para usar a expressão atual.';return;}
      $('#study-word-translation').value=validateTranslationText(result[0]);$('#study-word-status').textContent='Você pode ajustar a tradução ou acrescentar uma anotação antes de guardar.';
      $('#study-word-save').disabled=false;
    } catch(error){if(token===sequence)$('#study-word-status').textContent=error.message;}
    finally{if(token===sequence)button.disabled=false;}
  }

  async function practice(index) {
    captureDraft();
    const working=session,row=working.rows[index],token=sequence,opening=++practiceSequence;
    if(!working.lessons.has(index))working.lessons.set(index,translationPracticeLesson({target:working.target,pageId:working.prepared.pageId,pageTitle:working.prepared.page.title,blockId:row.id,original:row.original,translation:row.translation}));
    let lesson;
    try {lesson=await working.lessons.get(index);} catch(error){working.lessons.delete(index);throw error;}
    if(token!==sequence || opening!==practiceSequence || working!==session)return;
    captureDraft();
    const practiceState=activePractice={row,index,check:0,draft:translationDraftSession(drafts,lesson)};
    const panel=$('#translation-practice');panel.hidden=false;
    panel.innerHTML=`<div class="study-practice-head"><h3>Agora é a sua vez</h3><button id="practice-close" aria-label="Fechar prática">✕</button></div><p>Reescreva este trecho em ${languages[session.target]}. Depois revele uma tradução possível e compare suas escolhas.</p><blockquote class="study-prose">${readable(row.original)}</blockquote><label for="practice-attempt">Sua versão em ${languages[session.target]}</label><textarea id="practice-attempt" rows="4" maxlength="20000" lang="${session.target==='pt'?'pt-BR':'en-US'}" spellcheck="true" placeholder="Escreva do seu jeito…"></textarea><div class="study-row-actions"><button class="primary" id="practice-reveal">Revelar tradução para comparar</button><button class="secondary" id="practice-proofread">Revisar minha escrita</button></div><div id="practice-reference" hidden><h4>Uma tradução possível</h4><p class="study-prose" lang="${session.target}">${readable(row.translation)}</p><p class="translation-note">Compare a ordem das palavras, as expressões e os conectivos. Uma diferença não significa um erro.</p></div><div id="practice-feedback" role="status" aria-live="polite"></div>`;
    // Hide the reference translation for this row during the exercise.
    const sourceRow=dialog.querySelectorAll('.translation-reading article')[index];
    dialog.querySelectorAll('.practice-hidden').forEach(el=>el.classList.remove('practice-hidden'));
    sourceRow?.classList.add('practice-hidden');
    const draftInfo=document.createElement('div');
    draftInfo.innerHTML='<p id="practice-draft-status" class="translation-note" role="status" aria-live="polite"></p><p class="translation-note">Ao reabrir o aplicativo, use Aprender → Retomar um rascunho. A origem e a tradução de referência ficam junto da sua tentativa, sem precisar traduzir novamente.</p><div class="study-row-actions"><button class="secondary" id="practice-save-draft">Salvar rascunho agora</button><button class="secondary" id="practice-resume">Continuar em Aprender</button></div>';
    $('#practice-attempt').after(draftInfo);
    $('#practice-close').onclick=()=>{captureDraft();void drafts.flush();practiceSequence++;panel.hidden=true;sourceRow?.classList.remove('practice-hidden');activePractice=null;};
    $('#practice-reveal').onclick=()=>{$('#practice-reference').hidden=false;sourceRow?.classList.remove('practice-hidden');};
    $('#practice-proofread').onclick=proofPractice;
    $('#practice-attempt').value=practiceState.draft.text;
    $('#practice-attempt').oninput=()=>captureDraft({input:true});
    $('#practice-save-draft').onclick=async()=>{captureDraft();await drafts.flush();if(practiceState===activePractice)updateDraftStatus();};
    $('#practice-resume').onclick=()=>{const saved=captureDraft();if(!saved){ctx.toast('Escreva sua tentativa para continuar em Aprender.');return;}dialog.close();document.dispatchEvent(new CustomEvent('trama:learn',{detail:{draftId:saved.id}}));};
    updateDraftStatus();
    // The local field is usable immediately, even while the first disk read waits.
    void drafts.ready.then(()=>{
      if(practiceState!==activePractice || token!==sequence || opening!==practiceSequence)return;
      captureDraft();$('#practice-attempt').value=practiceState.draft.refresh();updateDraftStatus();
    });
    $('#practice-attempt').focus();
    panel.scrollIntoView({behavior:'smooth',block:'start'});
  }

  async function proofPractice() {
    const practiceState=activePractice,token=sequence,snapshot=$('#practice-attempt').value;
    if(!snapshot.trim()){$('#practice-feedback').textContent='Escreva sua versão antes de revisar.';return;}
    const check=++practiceState.check;$('#practice-proofread').disabled=true;$('#practice-feedback').textContent='Revisando com o LanguageTool local…';
    try {
      const response=await fetch('/api/proofread',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:maskMarkup(snapshot),language:session.target==='pt'?'pt-BR':'en-US'}),signal:controller?.signal});
      const result=await response.json();if(!response.ok)throw Error(result.error||'O corretor local não respondeu.');
      if(token!==sequence||practiceState!==activePractice||check!==practiceState.check)return;
      if($('#practice-attempt').value!==snapshot){$('#practice-feedback').textContent='Sua versão mudou durante a revisão. Clique em revisar novamente.';return;}
      const matches=(result.matches||[]).filter(match=>!isProtectedRange(snapshot,match.offset,match.length));
      $('#practice-feedback').innerHTML=matches.length?matches.map((match,index)=>`<article class="proof-match"><p>${esc(match.message)}</p><div class="proof-context">${esc(snapshot.slice(Math.max(0,match.offset-40),match.offset))}<mark>${esc(snapshot.slice(match.offset,match.offset+match.length))}</mark>${esc(snapshot.slice(match.offset+match.length,match.offset+match.length+40))}</div><div class="study-row-actions">${(match.replacements||[]).slice(0,4).map((replacement,r)=>`<button class="secondary" data-practice-fix="${index}" data-replacement="${r}">${esc(replacement.value||'Remover')}</button>`).join('')}</div></article>`).join(''):'<p class="translation-ready">Nenhum problema encontrado pelas regras locais. Isso não avalia se a tradução manteve o sentido.</p>';
      dialog.querySelectorAll('[data-practice-fix]').forEach(button=>button.onclick=()=>{try{const match=matches[Number(button.dataset.practiceFix)],revised=applySuggestion($('#practice-attempt').value,match,match.replacements[Number(button.dataset.replacement)].value,snapshot);if(revised.length>TRANSLATION_PRACTICE_LIMIT)throw Error('Esta sugestão ultrapassaria o limite de 20.000 caracteres da prática.');$('#practice-attempt').value=revised;captureDraft({input:true});proofPractice();}catch(error){ctx.toast(error.message);}});
    } catch(error){if(token===sequence&&practiceState===activePractice)$('#practice-feedback').textContent=error.message;}
    finally{if(token===sequence&&practiceState===activePractice)$('#practice-proofread').disabled=false;}
  }

  function openVocabulary() {
    const page=C.findPage(ctx.data,vocabularyTitle);
    if(page){dialog.close();ctx.openPage(page.title);}
    else ctx.toast('Traduza uma página e use “Guardar frase” para começar seu vocabulário.');
  }

  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-translate-page]');
    if(button){event.preventDefault();open(button.dataset.translatePage).catch(error=>ctx.toast(error.message));}
    if(event.target.closest('[data-vocabulary-open]'))openVocabulary();
  });
  return {open,flushDrafts:async()=>{captureDraft();return drafts.flush();}};
}
