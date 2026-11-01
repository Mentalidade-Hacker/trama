import * as C from './core.js';
import {browserDraftStore} from './learning-drafts.js';
import {WORD_LESSONS, WRITING_LESSONS} from './learning-content.js';
import {partOfSpeechHelp} from './learning-support.js';
import {LEARNING_PAGE, validateLesson, readLearning, readPracticeAttempt, learningStats, dueReviews, nextLesson,
  markLessonSeen, answerQuiz, savePractice, saveReviewCard, recordReview, dictionaryLesson, createLearningWriter} from './learning-core.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const fold = value => String(value || '').normalize('NFC').trim().toLocaleLowerCase();
const words = WORD_LESSONS.map(lesson => ({...lesson, kind:'word'}));
const writing = WRITING_LESSONS.map(lesson => ({...lesson, kind:'writing'}));
const labels = {pt:'Português', en:'English'};
const dateLabel = value => new Date(value).toLocaleString('pt-BR', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'});
const safeURL = value => { try { const url = new URL(value); return url.protocol === 'https:' ? url.href : '#'; } catch { return '#'; } };

export function setupLearning(ctx) {
  const dialog = document.createElement('dialog');
  dialog.id = 'learning-dialog'; dialog.setAttribute('aria-label', 'Aprender a escrever');
  document.body.append(dialog);
  const writer = createLearningWriter(ctx), savedDrafts = new Map(), draftContexts = new Map();
  const drafts = browserDraftStore(() => { const label=dialog.querySelector('[data-draft-status]'); if(label)label.textContent=drafts.status().message; });
  let state = {language:'pt', tab:'words', lesson:null, expanded:false, choice:null, feedback:null, revealed:false};
  let sequence = 0, controller = null, notice = '', error = '', loading = false, pendingAction = null;
  const $ = selector => dialog.querySelector(selector);
  const draftKey = () => state.lesson ? (state.tab==='review'?'review:':'')+state.lesson.id : '';
  const currentDraft = () => drafts.current(draftKey())?.data.text || '';

  function stop() { sequence++; controller?.abort(); controller = null; }
  function captureDraft() {
    const field = $('[data-learning-writing]'), context = draftContexts.get(field?.dataset.learningLesson);
    if (field && context) drafts.set({...context,text:field.value});
  }
  dialog.addEventListener('close', () => { captureDraft(); void drafts.flush(); stop(); });
  window.addEventListener('pagehide', () => { captureDraft(); void drafts.flush(); });
  document.addEventListener('visibilitychange', () => { if(document.hidden){captureDraft();void drafts.flush();} });
  dialog.addEventListener('keydown', event => event.stopPropagation());
  dialog.addEventListener('click', event => event.stopPropagation());
  dialog.addEventListener('input', event => {
    if (event.target.matches('[data-learning-writing]') && event.target.dataset.learningLesson) {
      captureDraft();
      const button = $('[data-learn-save]');
      if (button) { const saved = savedDrafts.get(event.target.dataset.learningLesson) === event.target.value.trim(); button.disabled = writer.busy || !!writer.pending || saved; button.textContent = saved ? 'Esta versão já está guardada' : 'Guardar minha prática'; }
    }
  });

  function canNavigate() {
    if (!writer.busy && !writer.pending) return true;
    error = writer.busy ? 'Aguarde a confirmação do salvamento.' : 'Conclua ou resolva o salvamento pendente antes de trocar de atividade.';
    render(); return false;
  }

  function choose(lesson) {
    captureDraft();
    state.lesson = lesson ? validateLesson(lesson) : null;
    state.expanded = false; state.choice = null; state.feedback = null; state.revealed = false; state.restored=false;
  }

  function selectTab(tab) {
    if (!canNavigate()) return;
    captureDraft(); stop(); loading = false; notice = ''; error = ''; state.tab = tab;
    choose(tab === 'review' ? dueReviews(ctx.data, state.language)[0]?.state.lesson : nextLesson(tab === 'words' ? words : writing, ctx.data, state.language));
    render(); dialog.scrollTop = 0;
  }

  function header() {
    const stats = writer.pending ? null : learningStats(ctx.data, state.language);
    return `<header class="learn-head"><div><p class="learn-eyebrow">UM POUCO DE PRÁTICA, TODOS OS DIAS</p><h2>Aprender a escrever</h2><p>Entenda uma escolha. Experimente na sua frase. Volte para lembrar.</p></div><button type="button" data-learn-close aria-label="Fechar aprendizagem">✕</button></header>
      <div class="learn-toolbar"><label>Quero praticar<select data-learn-language aria-label="Idioma da prática" ${writer.busy||writer.pending?'disabled':''}><option value="pt" ${state.language==='pt'?'selected':''}>Português</option><option value="en" ${state.language==='en'?'selected':''}>English</option></select></label><button class="secondary" data-learn-records>Meus registros ↗</button></div>
      <div class="learn-toolbar"><label>Retomar um rascunho<select data-draft-select aria-label="Retomar um rascunho"><option value="">Escolha uma atividade salva</option>${drafts.list().filter(row=>row.data.text).map(row=>`<option value="${esc(row.id)}">${esc(row.data.lesson.word||row.data.lesson.title)} · ${labels[row.data.language]} · ${esc(dateLabel(row.updated))}${row.dirty?' · pendente':''}</option>`).join('')}${drafts.archived.map((row,index)=>`<option value="archive:${index}">Cópia anterior: ${esc(row.data.lesson.word||row.data.lesson.title)}</option>`).join('')}</select></label><button class="secondary" data-draft-retry>Salvar rascunhos agora</button></div>
      <div class="learn-stats" aria-label="Seu progresso"><div><strong>${stats?.seen ?? '—'}</strong><span>atividades exploradas</span></div><div><strong>${stats?.practiced ?? '—'}</strong><span>com uma frase sua</span></div><div><strong>${stats?.due ?? '—'}</strong><span>para revisar agora</span></div></div>
      <nav class="learn-tabs" role="tablist" aria-label="Atividades de aprendizagem">${[['words','Novas palavras'],['writing','Melhorar escrita'],['review','Revisar']].map(([id,label])=>`<button id="learn-tab-${id}" role="tab" aria-selected="${state.tab===id}" aria-controls="learn-content" data-learn-tab="${id}" ${writer.busy||writer.pending?'disabled':''}>${label}</button>`).join('')}</nav>`;
  }

  function examples(lesson) {
    return `${lesson.examples.length ? `<section class="learn-examples"><h4>${lesson.kind==='dictionary'||lesson.source?'Exemplos da fonte':lesson.kind==='correction'?'Exemplos para estudar':lesson.examples.length===2?'Veja em duas situações':'Veja em uso'}</h4>${lesson.examples.map(example=>`<figure><blockquote lang="${lesson.language}">${esc(example.text)}</blockquote>${example.translation?`<figcaption>${esc(example.translation)}</figcaption>`:''}</figure>`).join('')}</section>` : ''}
      ${lesson.usage?`<section class="learn-usage"><h4>Quando usar</h4><p>${esc(lesson.usage)}</p></section>`:''}
      ${lesson.alternatives.length?`<section class="learn-alternatives"><h4>Palavras próximas, escolhas diferentes</h4>${lesson.alternatives.map(item=>`<p><strong>${esc(item.word)}</strong><span>${esc(item.note)}</span></p>`).join('')}</section>`:''}`;
  }

  function source(lesson) {
    return lesson.source?.url ? `<p class="learn-source">Fonte: <a href="${esc(safeURL(lesson.source.url))}" target="_blank" rel="noopener noreferrer">${esc(lesson.source.name)}</a>${lesson.source.licenseUrl?` · <a href="${esc(safeURL(lesson.source.licenseUrl))}" target="_blank" rel="noopener noreferrer">${esc(lesson.source.license)}</a>`:''}. A definição e os exemplos vêm da fonte; sua frase será uma anotação pessoal.</p>` : '';
  }

  function quiz(lesson) {
    if (!lesson.quiz) return '<p class="learn-footnote">Esta atividade é aberta. Guarde uma frase sua e compare com a referência; não há uma nota automática para seu texto.</p>';
    const result = state.feedback;
    return `<section class="learn-quiz" aria-labelledby="learn-quiz-title"><span class="learn-step">1 · ESCOLHA COM ATENÇÃO</span><h3 id="learn-quiz-title">Qual opção cabe melhor aqui?</h3><p class="learn-quiz-sentence" lang="${lesson.language}">${esc(lesson.quiz.sentence)}</p><div class="learn-options">${lesson.quiz.options.map((option,index)=>`<button type="button" data-learn-answer="${index}" aria-pressed="${state.choice===index}" ${result||writer.busy||writer.pending?'disabled':''} class="${state.choice===index?'chosen':''} ${result&&index===lesson.quiz.answer?'answer':''}"><span>${String.fromCharCode(65+index)}</span>${esc(option)}</button>`).join('')}</div>${result?`<div class="learn-feedback ${result.correct?'is-correct':''}" role="status"><strong>${result.correct?'Essa é a escolha prevista.':'Vamos comparar as escolhas.'}</strong><p>${esc(result.explanation)}</p><p class="learn-footnote">Resposta registrada. Uma escolha neste exercício não avalia toda a sua escrita.</p></div>`:''}</section>`;
  }

  function practice(lesson, review=false) {
    draftContexts.set(draftKey(),{key:draftKey(),lesson,tab:state.tab});
    const count = readLearning(ctx.data).cards.get(lesson.id)?.state.attempts || 0;
    const saved = savedDrafts.get(draftKey()) === currentDraft().trim();
    return `<section class="learn-practice"><span class="learn-step">${review?'PRATIQUE DE MEMÓRIA':lesson.quiz?'2 · USE DO SEU JEITO':'AGORA É COM VOCÊ'}</span><h3>Uma frase que seja sua</h3><p id="learn-writing-prompt">${esc(lesson.prompt)}</p><label class="learn-writing-label" for="learn-own-sentence">Meu texto em ${labels[lesson.language]}</label><textarea id="learn-own-sentence" rows="4" maxlength="12000" data-learning-writing data-learning-lesson="${esc(draftKey())}" data-writing-language="${lesson.language==='pt'?'pt-BR':'en-US'}" lang="${lesson.language==='pt'?'pt-BR':'en-US'}" spellcheck="true" aria-describedby="learn-writing-prompt" placeholder="Pense em uma situação real e escreva uma frase…">${esc(currentDraft())}</textarea><p class="learn-footnote" data-draft-status role="status">${esc(drafts.status().message)}</p><div class="learn-practice-actions"><button class="primary" data-learn-save ${writer.busy||writer.pending||saved?'disabled':''}>${saved?'Esta versão já está guardada':'Guardar minha prática'}</button><span>${count&&!writer.pending?`${count} ${count===1?'texto guardado':'textos guardados'} nesta atividade`:'Seu texto fica no seu grafo'}</span></div><p class="learn-footnote">O rascunho é salvo automaticamente neste computador e pode ser retomado ao reabrir. “Guardar minha prática” registra uma versão no grafo e agenda sua revisão. As sugestões ajudam com a forma; o sentido e a adequação continuam sendo escolhas suas.</p></section>`;
  }

  function lessonContent() {
    const lesson = state.lesson;
    if (loading) return '<div class="learn-empty" role="status"><span class="learn-loading"></span><h3>Buscando o significado no dicionário local…</h3><p>A palavra fica neste computador.</p></div>';
    if (!lesson) return '<div class="learn-empty"><h3>Nenhuma atividade disponível neste idioma.</h3></div>';
    const correction = lesson.kind === 'correction', isWriting = lesson.kind === 'writing' || correction;
    const saved = !writer.pending && !writer.busy && !!readLearning(ctx.data).cards.get(lesson.id)?.state.dueAt;
    return `<div class="learn-lesson-top"><span class="learn-pill">${correction?'A PARTIR DA SUA CORREÇÃO':lesson.kind==='dictionary'?'UMA PALAVRA QUE VOCÊ ESCOLHEU':isWriting?'OFICINA DE ESCRITA':'PALAVRA EM USO'}</span>${!correction&&lesson.kind!=='dictionary'?'<button class="learn-next" data-learn-next>Outra atividade →</button>':''}</div>
      <article class="learn-card"><div class="learn-card-heading"><h3 lang="${lesson.language}">${esc(isWriting?lesson.title:lesson.word)}</h3>${lesson.partOfSpeech&&!correction?`<span>${esc(lesson.partOfSpeech)}</span>`:''}</div>${!correction&&partOfSpeechHelp(lesson.partOfSpeech)?`<p class="learn-class-help">${esc(partOfSpeechHelp(lesson.partOfSpeech))}</p>`:''}
      ${lesson.meaning&&!correction?`<p class="learn-meaning">${esc(lesson.meaning)}</p>`:''}
      ${isWriting?`<div class="learn-comparison"><section><span>ANTES</span><p lang="${lesson.language}">${esc(lesson.before)}</p></section>${state.expanded||correction?`<section class="learn-after"><span>${correction?'SUGESTÃO PARA ESTE ALERTA':'UMA FORMA MAIS CLARA'}</span><p lang="${lesson.language}">${esc(lesson.after)}</p></section>`:''}</div>`:''}
      ${state.expanded||correction?`${lesson.explanation?`<div class="learn-explanation"><h4>O que mudou e por quê</h4><p>${esc(lesson.explanation)}</p></div>`:''}${correction&&lesson.meaning?`<section class="learn-related"><h4>Uma palavra relacionada para explorar: ${esc(lesson.word)}</h4><p class="learn-footnote">Atividade autoral para estudar um uso da palavra; não é uma análise da classe ou do sentido dela na sua frase.</p><p class="learn-meaning">${esc(lesson.meaning)}</p>${lesson.partOfSpeech?`<p class="learn-class-help">${esc(lesson.partOfSpeech)} · ${esc(partOfSpeechHelp(lesson.partOfSpeech))}</p>`:''}${examples(lesson)}</section>`:correction?'':examples(lesson)}`:`<button class="secondary learn-reveal" data-learn-expand>${isWriting?'Ver uma revisão possível e entender a mudança':'Ver exemplos e diferenças de uso'}</button>`}
      ${source(lesson)}${correction?`<button class="secondary" data-learn-card ${writer.busy||writer.pending||saved?'disabled':''}>${saved?'Correção guardada para revisar':'Guardar esta correção para revisar'}</button>${lesson.word?` <button class="secondary" data-learn-dictionary>Consultar palavra no dicionário</button>`:''}<p class="learn-footnote">Este cartão só é guardado quando você pede. A explicação acima é a sugestão recebida do corretor.</p>`:lesson.kind==='dictionary'?`<button class="secondary" data-learn-card ${writer.busy||writer.pending||saved?'disabled':''}>${saved?'Palavra guardada para revisar':'Guardar palavra para revisar'}</button>`:''}</article>
      ${quiz(lesson)}${practice(lesson)}<div class="learn-bottom"><span>Uma atividade de cada vez já é um começo.</span>${!correction&&lesson.kind!=='dictionary'?'<button class="secondary" data-learn-next>Continuar com outra atividade →</button>':''}</div>`;
  }

  function reviewContent() {
    const reviews = dueReviews(ctx.data, state.language);
    let card = reviews.find(item => item.state.lesson.id === state.lesson?.id);
    if (!card && state.restored && state.lesson) return lessonContent();
    if (!card && reviews.length) { card = reviews[0]; choose(card.state.lesson); }
    if (!card) {
      const upcoming = [...readLearning(ctx.data).cards.values()].filter(item=>item.state.lesson.language===state.language&&item.state.dueAt).sort((a,b)=>a.state.dueAt.localeCompare(b.state.dueAt))[0];
      return `<div class="learn-empty"><span class="learn-empty-mark">↗</span><h3>${upcoming?'Seu próximo encontro com estas palavras já está marcado.':'Sua revisão começa com a primeira prática.'}</h3><p>${upcoming?`Próximo cartão: ${esc(dateLabel(upcoming.state.dueAt))}. Enquanto isso, experimente uma palavra nova.`:'Guarde uma frase sua ou uma correção. Depois, volte aqui para tentar lembrar antes de revelar a referência.'}</p><button class="primary" data-learn-tab="words">Explorar novas palavras</button></div>`;
    }
    const lesson = card.state.lesson;
    const lastAttemptBlock = [...card.block.children].reverse().find(block=>block.text.startsWith('Minha escrita ·'));
    const lastAttempt = readPracticeAttempt(lastAttemptBlock)?.text || lastAttemptBlock?.children?.[0]?.text;
    return `<div class="learn-lesson-top"><span class="learn-pill">RELEMBRAR ANTES DE RELER</span><span class="learn-remaining">${reviews.length} ${reviews.length===1?'cartão disponível':'cartões disponíveis'}</span></div><article class="learn-card learn-review"><h3 lang="${lesson.language}">${esc(lesson.word||lesson.title)}</h3><p>${lesson.kind==='word'||lesson.kind==='dictionary'?'Como você explicaria esta palavra? Pense em uma frase antes de revelar.':'Que escolha de escrita você praticou aqui? Tente explicar a mudança antes de revelar.'}</p>${lesson.before?`<blockquote lang="${lesson.language}">${esc(lesson.before)}</blockquote>`:''}
      ${state.revealed?`<div class="learn-review-answer">${lesson.meaning?`<p class="learn-meaning">${esc(lesson.meaning)}</p>`:''}${lesson.after?`<h4>Uma referência</h4><p lang="${lesson.language}">${esc(lesson.after)}</p>`:''}${lesson.explanation?`<p>${esc(lesson.explanation)}</p>`:''}${examples(lesson)}${lastAttempt?`<h4>Sua última frase guardada</h4><blockquote>${esc(lastAttempt)}</blockquote>`:''}${source(lesson)}</div><div class="learn-rate"><p>Como foi lembrar? Você faz esta avaliação.</p><button class="secondary" data-learn-rate="again" ${writer.busy||writer.pending?'disabled':''}>Quero praticar de novo <small>em 10 minutos</small></button><button class="primary" data-learn-rate="remembered" ${writer.busy||writer.pending?'disabled':''}>Lembrei <small>revisar em outro dia</small></button></div>`:'<button class="primary" data-learn-reveal>Revelar referência</button>'}</article>${practice(lesson,true)}`;
  }

  function render() {
    captureDraft();
    dialog.innerHTML = header()+`<div class="learn-notices" aria-live="polite">${error?`<p class="learn-error">${esc(error)}</p>`:''}${notice?`<p class="learn-success">${esc(notice)}</p>`:''}${writer.busy?'<p class="learn-saving">Salvando no seu grafo…</p>':''}${writer.pending&&!writer.busy?'<div class="learn-pending"><p>Há um registro aguardando confirmação no disco. Seus rascunhos continuam aqui.</p><button class="secondary" data-learn-retry>Tentar salvar o mesmo registro novamente</button></div>':''}</div><main id="learn-content" class="learn-body" role="tabpanel" aria-labelledby="learn-tab-${state.tab}">${state.tab==='review'?reviewContent():lessonContent()}</main>`;
    $('[data-learn-close]').onclick = () => dialog.close();
    $('[data-draft-select]').onchange = event => { if(!canNavigate())return;captureDraft();const value=event.target.value;const row=value.startsWith('archive:')?drafts.recoverArchived(Number(value.slice(8))):drafts.list().find(item=>item.id===value);if(row)restoreDraft(row); };
    $('[data-draft-retry]').onclick = async () => { captureDraft();const ok=await drafts.flush();if(dialog.open){notice=ok?'Rascunhos salvos no computador.':'';error=ok?'':drafts.status().message;render();} };
    $('[data-learn-language]').onchange = event => { const language = event.target.value; if (!canNavigate()) return; state.language = language; selectTab(state.tab); };
    $('[data-learn-records]').onclick = () => { const page = C.findPage(ctx.data, LEARNING_PAGE); if (page) { dialog.close(); ctx.openPage(page.title); } else ctx.toast('Guarde sua primeira prática para criar os registros no grafo.'); };
    dialog.querySelectorAll('[data-learn-tab]').forEach(button=>button.onclick=()=>selectTab(button.dataset.learnTab));
    dialog.querySelectorAll('[data-learn-next]').forEach(button=>button.onclick=advance);
    const expand = $('[data-learn-expand]'); if (expand) expand.onclick = () => { state.expanded = true; render(); };
    dialog.querySelectorAll('[data-learn-answer]').forEach(button=>button.onclick=()=>respond(Number(button.dataset.learnAnswer)));
    const save = $('[data-learn-save]'); if (save) save.onclick = saveSentence;
    const card = $('[data-learn-card]'); if (card) card.onclick = () => perform(data=>saveReviewCard(data,state.lesson), 'Cartão guardado. Ele já está disponível em Revisar.');
    const dictionary = $('[data-learn-dictionary]'); if (dictionary) dictionary.onclick = () => { captureDraft(); document.dispatchEvent(new CustomEvent('trama:dictionary',{detail:{word:state.lesson.word,language:state.language}})); };
    const reveal = $('[data-learn-reveal]'); if (reveal) reveal.onclick = () => { state.revealed = true; render(); };
    dialog.querySelectorAll('[data-learn-rate]').forEach(button=>button.onclick=()=>rate(button.dataset.learnRate));
    const retry = $('[data-learn-retry]'); if (retry) retry.onclick = retrySave;
  }

  async function perform(mutate, message, afterSaved=null) {
    if (writer.busy || writer.pending) return;
    captureDraft(); error = ''; notice = '';
    const token = sequence;
    pendingAction = {message, afterSaved, token};
    const promise = writer.commit(mutate); render();
    try {
      const result = await promise;
      if (token === sequence && dialog.open) { notice = message; const resetScroll = afterSaved?.(result) === true; render(); if (resetScroll) dialog.scrollTop = 0; }
      pendingAction = null;
    } catch (failure) {
      if (token === sequence && dialog.open) { error = failure.message; render(); }
      if (!writer.pending) pendingAction = null;
    }
  }

  async function retrySave() {
    const action = pendingAction, token = sequence;
    error = ''; const promise = writer.retry(); render();
    try {
      const result = await promise;
      if (token === sequence && dialog.open) {
        let resetScroll = false;
        if (result) {
          notice = action?.message || 'Registro salvo no seu grafo.';
          if (action?.token === sequence) resetScroll = action.afterSaved?.(result) === true;
        }
        render(); if (resetScroll) dialog.scrollTop = 0;
      }
      pendingAction = null;
    } catch (failure) { if (token === sequence && dialog.open) { error = failure.message; render(); } if (!writer.pending) pendingAction = null; }
  }

  function advance() {
    const lesson = state.lesson;
    if (!lesson) return;
    perform(data=>markLessonSeen(data,lesson), 'Atividade explorada registrada.', () => {
      choose(nextLesson(state.tab==='words'?words:writing,ctx.data,state.language,lesson.id));
      notice = ''; return true;
    });
  }

  function respond(choice) {
    const lesson = state.lesson;
    perform(data=>answerQuiz(data,lesson,choice), '', result => { state.choice = choice; state.feedback = {correct:result.correct,explanation:result.explanation}; });
  }

  function saveSentence() {
    const sentence = $('[data-learning-writing]')?.value || '', lesson = state.lesson, key = draftKey();
    if (!sentence.trim()) { error = 'Escreva uma frase ou um pequeno parágrafo antes de guardar.'; render(); $('[data-learning-writing]')?.focus(); return; }
    if (savedDrafts.get(key) === sentence.trim()) { notice = 'Esta versão da sua frase já foi guardada.'; render(); return; }
    perform(data=>savePractice(data,lesson,sentence), 'Prática salva no seu grafo. A revisão espaçada ajuda a voltar a esta ideia.', () => { savedDrafts.set(key,sentence.trim()); });
  }

  function rate(rating) {
    const lesson = state.lesson;
    perform(data=>recordReview(data,lesson.id,rating,{revealed:state.revealed}), rating==='again'?'Você poderá tentar este cartão de novo em 10 minutos.':'Autoavaliação salva. O cartão volta em outro dia.', () => { choose(dueReviews(ctx.data,state.language)[0]?.state.lesson || null); return true; });
  }

  async function fetchWord(word, language, token) {
    controller = new AbortController();
    try {
      const response = await fetch('/api/dictionary',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({word,language}),signal:controller.signal});
      const result = await response.json();
      if (token !== sequence || !dialog.open) return;
      if (!response.ok) throw Error(result.error || 'Não foi possível consultar o dicionário local.');
      const found = dictionaryLesson(word,language,result);
      choose(found);
      loading = false;
      if (!result.found) notice = 'Não encontramos uma definição nesta base. Você pode guardar uma anotação pessoal, sem tratá-la como significado confirmado.';
      render();
    } catch (failure) {
      if (token !== sequence || failure.name === 'AbortError') return;
      loading = false; error = failure.message;
      choose(dictionaryLesson(word,language,null));
      render();
    }
  }

  function restoreDraft(row) {
    captureDraft(); $('[data-learning-writing]')?.remove();
    drafts.select(row.id); state.language=row.data.language;state.tab=row.data.tab;
    choose(row.data.lesson);state.restored=true;notice='Rascunho recuperado. Continue de onde parou.';loading=false;render();
  }

  async function open(detail={}) {
    if (writer.busy) { ctx.toast('Aguarde a confirmação do salvamento da prática.'); return; }
    captureDraft(); stop(); ctx.finishEditing(); notice = ''; error = ''; loading = false;
    const opening=sequence;
    await drafts.ready;
    if(opening!==sequence)return;
    const latest = drafts.list().find(row=>row.data.text);
    if (!detail.word && !detail.correction && latest) {
      restoreDraft(latest);if(!dialog.open)dialog.showModal();dialog.scrollTop=0;return;
    }
    const language = detail.language === 'en' || (!detail.language && ctx.language?.().startsWith('en')) ? 'en' : 'pt';
    state.language = language;
    const word = typeof detail.word === 'string' ? detail.word.trim().slice(0,160) : '';
    const related = word ? words.find(lesson=>lesson.language===language && fold(lesson.word)===fold(word)) : null;
    if (detail.correction) {
      try {
        const correction = detail.correction;
        state.tab = 'writing';
        choose({...related,id:'correction:'+C.uid(),kind:'correction',language,word:word||undefined,title:word?`Uma escolha com “${word}”`:'Aprender com esta correção',
          before:String(correction.before||'').slice(0,12000),after:String(correction.after||'').slice(0,12000),explanation:String(correction.explanation||'').slice(0,12000),
          prompt:word?`Crie uma frase nova com “${word}”, aplicando o que observou na correção.`:'Escreva uma nova frase aplicando a mudança que você observou acima.'});
      } catch (failure) { ctx.toast(failure.message); return; }
    } else {
      state.tab = 'words';
      choose(related || (word ? null : nextLesson(words,ctx.data,language)));
      loading = !!word && !related;
    }
    render(); if (!dialog.open) dialog.showModal(); dialog.scrollTop = 0;
    if (word && !related && !detail.correction) fetchWord(word,language,sequence);
  }

  document.addEventListener('click', event => { if (event.target.closest('[data-learning-open]')) { event.preventDefault(); open(); } });
  document.addEventListener('trama:learn', event => open(event.detail || {}));
  return {open, close:()=>dialog.close(), dialog, flushDrafts:async()=>{captureDraft();return drafts.flush();}};
}
