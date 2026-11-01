import {spellingRequest} from './spell-client.js';
import {maskMarkup,applySuggestion,isProtectedRange} from './proofread.js';
import {correctionForStudy} from './learning-support.js';
import {checkWritingRules,mergeWritingMatches} from './writing-rules.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const selector='.block-editor,#practice-attempt,[data-component-cell],[data-component-title],[data-learning-writing]';
const fold=word=>word.normalize('NFC').toLocaleLowerCase();
const validLanguage=value=>['pt-BR','pt-PT','en-US','en-GB'].includes(value)?value:null;

export function wordAtSelection(element) {
  if(!element||typeof element.value!=='string')return '';
  const start=element.selectionStart??0,end=element.selectionEnd??start;
  if(end>start)return element.value.slice(start,end).trim().slice(0,100);
  for(const match of element.value.matchAll(/[\p{L}\p{M}]+(?:['’\-][\p{L}\p{M}]+)*/gu))if(match.index<=start&&match.index+match[0].length>=start)return match[0];
  return '';
}

export function setupLiveWriting(ctx) {
  const states=new WeakMap(),connectedStates=new Set();let active=null,grammarBusy=false,grammarStatus=null,statusTime=0,panelSequence=0;
  let enabled=true,ignored={};
  try{enabled=localStorage.getItem('trama-live-writing')!=='off';ignored=JSON.parse(localStorage.getItem('trama-spell-ignored')||'{}');if(!ignored||typeof ignored!=='object'||Array.isArray(ignored))ignored={};}catch{}
  const language=el=>validLanguage(el.dataset.writingLanguage)||(el.matches('#practice-attempt')?validLanguage(el.lang):null)||ctx.language();
  const ignoredWords=lang=>Array.isArray(ignored[lang])?ignored[lang].filter(word=>typeof word==='string').slice(0,5000):[];
  const current=state=>state.el.isConnected&&enabled&&state===active;

  function attach(el) {
    let state=states.get(el);if(state)return state;
    for(const old of connectedStates)if(!old.el.isConnected){old.observer.disconnect();clearTimeout(old.spellTimer);clearTimeout(old.grammarTimer);clearTimeout(old.localTimer);connectedStates.delete(old);}
    const wasFocused=document.activeElement===el,selectionStart=el.selectionStart,selectionEnd=el.selectionEnd;
    const shell=document.createElement('div');shell.className='live-editor-shell';
    el.before(shell);shell.append(el);el.classList.add('live-writing-input');
    const mirror=document.createElement('div');mirror.className='live-writing-mirror';mirror.setAttribute('aria-hidden','true');const mirrorText=document.createElement('div');mirror.append(mirrorText);shell.prepend(mirror);
    const panel=document.createElement('div');panel.className='live-writing-feedback';panel.id='live-writing-'+(++panelSequence);panel.setAttribute('aria-label','Sugestões enquanto escreve');shell.after(panel);
    state={el,shell,mirror,mirrorText,panel,sequence:0,spell:[],local:[],grammar:[],snapshot:el.value,selected:null,expanded:false,spellMessage:'',localMessage:'',grammarMessage:'',spellError:'',grammarError:'',limitError:'',composing:false,spellTimer:null,grammarTimer:null,localTimer:null};
    states.set(el,state);
    panel.addEventListener('pointerdown',event=>{if(event.target.closest('button'))event.preventDefault();});
    panel.addEventListener('click',event=>event.stopPropagation());
    el.addEventListener('scroll',()=>syncMirror(state));
    state.observer=new ResizeObserver(()=>syncMirror(state));state.observer.observe(el);
    connectedStates.add(state);
    if(wasFocused){el.focus({preventScroll:true});el.setSelectionRange(selectionStart,selectionEnd);}
    return state;
  }

  function syncMirror(state) {
    if(!state.el.isConnected)return;
    const style=getComputedStyle(state.el),inner=state.mirrorText;
    for(const key of ['font','lineHeight','letterSpacing','textIndent','paddingTop','paddingRight','paddingBottom','paddingLeft','borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth','boxSizing','textAlign','tabSize'])inner.style[key]=style[key];
    inner.style.width=state.el.clientWidth+'px';
    inner.style.whiteSpace=state.el.tagName==='INPUT'?'pre':'pre-wrap';
    inner.style.transform=`translate(${-state.el.scrollLeft}px,${-state.el.scrollTop}px)`;
    state.mirror.style.height=state.el.clientHeight+'px';
  }

  function matches(state) {
    if(state.snapshot!==state.el.value)return [];
    return mergeWritingMatches(state.local,state.spell,state.grammar);
  }

  function paint(state) {
    const items=enabled?matches(state):[];let text='',position=0;
    for(const match of items){text+=esc(state.el.value.slice(position,match.offset));text+=`<mark class="${match.rule?.issueType==='misspelling'?'live-spelling-mark':'live-grammar-mark'}">${esc(state.el.value.slice(match.offset,match.offset+match.length))||'\u200b'}</mark>`;position=match.offset+match.length;}
    text+=esc(state.el.value.slice(position))+'\u200b';state.mirrorText.innerHTML=text;syncMirror(state);
    if(!enabled){state.panel.hidden=true;return;}
    const errors=[state.limitError,state.spellError,state.grammarError].filter(Boolean);
    state.panel.hidden=!items.length&&!errors.length&&!state.expanded;
    if(state.panel.hidden){state.panel.innerHTML='';return;}
    // Uma resposta tardia não deve tirar o foco de quem navega pelos botões.
    const focused=state.panel.contains?.(document.activeElement)?document.activeElement:null;
    const focusKey=focused?['liveToggle','liveIssue','liveFix','liveAccept','liveDismiss','liveDictionary','liveLearn','liveSettings'].find(key=>Object.hasOwn(focused.dataset,key)):null;
    const focusValue=focusKey?focused.dataset[focusKey]:null;
    const problem=state.expanded&&state.selected?items.find(item=>item.offset===state.selected.offset&&item.length===state.selected.length&&item.rule?.issueType===state.selected.rule?.issueType):null;
    const count=items.length?`${items.length} ${items.length===1?'sugestão':'sugestões'}`:'Revisão';
    const detailsId=state.panel.id+'-details';
    const engines=[state.spellMessage,state.localMessage,state.grammarMessage].filter(Boolean).join(' · ');
    state.panel.innerHTML=`<div class="live-writing-summary"><span class="live-status" role="status" aria-live="polite" aria-atomic="true"><button type="button" class="live-count" data-live-toggle aria-expanded="${state.expanded}" aria-controls="${detailsId}">${esc(count)} <span aria-hidden="true">${state.expanded?'⌃':'⌄'}</span></button></span><button type="button" class="live-help" data-live-settings title="Idioma e revisão ao digitar" aria-label="Idioma e revisão ao digitar">⚙</button></div>${errors.map(message=>`<p class="live-check-error" role="alert">${esc(message)}</p>`).join('')}<div id="${detailsId}" class="live-review-details"${state.expanded?'':' hidden'}>${state.expanded?`<p class="live-engine-status">${esc(engines||'Revisão local enquanto você escreve.')}</p>${items.length?`<div class="live-issues">${items.slice(0,10).map((match,index)=>`<button type="button" data-live-issue="${index}" class="${match.rule?.issueType==='misspelling'?'live-spelling-issue':'live-grammar-issue'}" title="${esc(match.message)}">${esc(state.el.value.slice(match.offset,match.offset+match.length)||'Pontuação')} <span>${match.source==='local-basic'?'regra local':match.rule?.issueType==='misspelling'?'ortografia':'gramática'}</span></button>`).join('')}${items.length>10?`<span>+${items.length-10} ocorrências</span>`:''}</div>`:''}${problem?`<div class="live-suggestion"><strong>${esc(problem.rule?.issueType==='misspelling'?'Possível palavra incorreta':'Sugestão de escrita')}</strong><p>${esc(problem.message)}</p><div class="live-replacements">${(problem.replacements||[]).slice(0,6).map((replacement,index)=>`<button type="button" data-live-fix="${index}">${esc(replacement.value||'Remover')}</button>`).join('')||'<span>Buscando sugestões…</span>'}</div><div class="live-suggestion-tools"><button type="button" data-live-dictionary>Ver significado</button>${problem.replacements?.length?'<button type="button" data-live-learn>Entender e praticar</button>':''}${problem.rule?.issueType==='misspelling'?'<button type="button" data-live-accept>Aceitar esta palavra</button>':''}<button type="button" data-live-dismiss>Fechar explicação</button></div></div>`:''}`:''}</div>`;
    state.panel.querySelector('[data-live-settings]').onclick=settings;
    state.panel.querySelector('[data-live-toggle]').onclick=()=>{state.expanded=!state.expanded;if(!state.expanded)state.selected=null;paint(state);};
    state.panel.querySelectorAll('[data-live-issue]').forEach(button=>button.onclick=()=>selectIssue(state,Number(button.dataset.liveIssue)));
    if(problem){
      state.panel.querySelectorAll('[data-live-fix]').forEach(button=>button.onclick=()=>{
        try{const updated=applySuggestion(state.el.value,problem,problem.replacements[Number(button.dataset.liveFix)].value,state.snapshot);if(state.el.matches('.block-editor,[data-component-cell],[data-component-title]'))ctx.checkpoint();state.el.value=updated;state.el.focus();state.el.setSelectionRange(problem.offset+problem.replacements[Number(button.dataset.liveFix)].value.length,problem.offset+problem.replacements[Number(button.dataset.liveFix)].value.length);state.el.dispatchEvent(new Event('input',{bubbles:true}));state.el.dispatchEvent(new Event('change',{bubbles:true}));}catch(error){ctx.toast(error.message);}
      });
      state.panel.querySelector('[data-live-dictionary]').onclick=()=>dictionary(state.el.value.slice(problem.offset,problem.offset+problem.length),language(state.el));
      const learn=state.panel.querySelector('[data-live-learn]');
      if(learn)learn.onclick=()=>{try{if(state.el.value!==state.snapshot)throw Error('O texto mudou. Aguarde a revisão atual.');document.dispatchEvent(new CustomEvent('trama:learn',{detail:correctionForStudy(state.snapshot,problem,language(state.el))}));}catch(error){ctx.toast(error.message);}};
      const accept=state.panel.querySelector('[data-live-accept]');if(accept)accept.onclick=()=>{const lang=language(state.el),word=fold(state.el.value.slice(problem.offset,problem.offset+problem.length));ignored[lang]=[...new Set([...ignoredWords(lang),word])].slice(-5000);try{localStorage.setItem('trama-spell-ignored',JSON.stringify(ignored));}catch{}schedule(state,true);};
      state.panel.querySelector('[data-live-dismiss]').onclick=()=>{state.selected=null;paint(state);};
    }
    if(focusKey){const attr='data-'+focusKey.replace(/[A-Z]/g,letter=>'-'+letter.toLowerCase());const target=[...state.panel.querySelectorAll('['+attr+']')].find(node=>node.dataset[focusKey]===focusValue)||state.panel.querySelector('[data-live-toggle]');target?.focus({preventScroll:true});}
  }

  async function selectIssue(state,index) {
    const issue=matches(state)[index];if(!issue)return;
    state.expanded=true;state.selected=issue;paint(state);
    if(issue.rule?.issueType!=='misspelling'||issue.replacements?.length)return;
    const snapshot=state.snapshot,token=state.sequence;
    try{const result=await spellingRequest({action:'suggest',word:snapshot.slice(issue.offset,issue.offset+issue.length),language:language(state.el)});if(!current(state)||state.sequence!==token||state.el.value!==snapshot)return;issue.replacements=result.replacements||[];if(!issue.replacements.length)issue.message+=' Nenhuma substituição próxima foi encontrada; confira no dicionário.';paint(state);if(!issue.replacements.length){const node=state.panel.querySelector('.live-replacements');if(node)node.textContent='Sem sugestões automáticas para esta palavra.';}}
    catch(error){ctx.toast(error.message);}
  }

  function schedule(state,checkCurrent=false) {
    if(active&&active!==state&&!active.el.isConnected){active.observer.disconnect();clearTimeout(active.spellTimer);clearTimeout(active.grammarTimer);clearTimeout(active.localTimer);}
    active=state;state.sequence++;state.snapshot=state.el.value;state.spell=[];state.local=[];state.grammar=[];state.selected=null;state.expanded=false;state.localMessage='';state.spellError='';state.grammarError='';state.limitError='';
    clearTimeout(state.spellTimer);clearTimeout(state.grammarTimer);clearTimeout(state.localTimer);
    if(!enabled||state.composing){paint(state);return;}
    if(state.el.value.length>20000){state.limitError='Divida o texto: revisão automática até 20 mil caracteres por bloco.';state.spellMessage='';state.grammarMessage='';paint(state);return;}
    state.spellMessage='Verificando ortografia…';state.grammarMessage='';paint(state);
    const completed=/[\s.,;:!?()[\]{}]$/.test(state.el.value.slice(0,state.el.selectionStart));
    state.localTimer=setTimeout(()=>checkLocal(state),checkCurrent?0:100);
    state.spellTimer=setTimeout(()=>checkSpelling(state,true),checkCurrent?0:completed?80:420);
    state.grammarTimer=setTimeout(()=>checkGrammar(state),800);
  }

  function checkLocal(state) {
    if(!current(state)||state.composing||state.snapshot!==state.el.value)return;
    const lang=language(state.el),accepted=new Set(ignoredWords(lang));
    state.local=checkWritingRules(state.snapshot,lang).filter(match=>match.rule?.issueType!=='misspelling'||!accepted.has(fold(state.snapshot.slice(match.offset,match.offset+match.length))));
    state.localMessage='Regras básicas locais';paint(state);
  }

  async function checkSpelling(state,checkCurrent) {
    if(!current(state)||state.composing)return;
    const token=state.sequence,snapshot=state.el.value,lang=language(state.el);
    try{const result=await spellingRequest({action:'check',text:snapshot,language:lang,caret:state.el.selectionStart,checkCurrent,ignored:ignoredWords(lang)});if(!current(state)||token!==state.sequence||snapshot!==state.el.value)return;state.spell=(result.matches||[]).filter(match=>!isProtectedRange(snapshot,match.offset,match.length));state.spellMessage=state.spell.length?`${state.spell.length} ${state.spell.length===1?'alerta de ortografia':'alertas de ortografia'}`:'Ortografia verificada';paint(state);}
    catch(error){if(current(state)&&token===state.sequence){state.spellError=error.message;state.spellMessage='Ortografia indisponível';paint(state);}}
  }

  async function status() {
    if(grammarStatus&&Date.now()-statusTime<20000)return grammarStatus;
    const response=await fetch('/api/proofread/status');if(!response.ok)throw Error('Gramática local indisponível');grammarStatus=await response.json();statusTime=Date.now();return grammarStatus;
  }

  async function checkGrammar(state) {
    if(!current(state)||state.composing||state.el.value.length>20000||!maskMarkup(state.el.value).trim())return;
    if(grammarBusy){state.grammarTimer=setTimeout(()=>checkGrammar(state),700);return;}
    const token=state.sequence,snapshot=state.el.value;
    grammarBusy=true;
    try{
      const info=await status();if(!current(state)||token!==state.sequence)return;
      if(!info.available){state.grammarMessage='gramática ampliada: configurar em ⚙';paint(state);return;}
      state.grammarMessage=info.running?'analisando gramática ampliada…':'iniciando gramática ampliada local…';paint(state);
      const response=await fetch('/api/proofread',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:maskMarkup(snapshot),language:language(state.el)})});
      const result=await response.json();if(!current(state)||token!==state.sequence||snapshot!==state.el.value)return;
      if(response.status===409){state.grammarMessage='aguardando o corretor…';state.grammarTimer=setTimeout(()=>checkGrammar(state),1000);paint(state);return;}
      if(!response.ok)throw Error(result.error||'Gramática local indisponível');
      state.grammar=(result.matches||[]).filter(match=>match.rule?.issueType!=='misspelling'&&!isProtectedRange(snapshot,match.offset,match.length));state.grammarMessage=state.grammar.length?`${state.grammar.length} ${state.grammar.length===1?'sugestão da gramática ampliada':'sugestões da gramática ampliada'}`:'gramática ampliada verificada';paint(state);
    }catch(error){if(current(state)&&token===state.sequence){state.grammarError=error.message;state.grammarMessage='Gramática ampliada indisponível';paint(state);}}
    finally{grammarBusy=false;}
  }

  function dictionary(word,lang){document.dispatchEvent(new CustomEvent('trama:dictionary',{detail:{word,language:lang.startsWith('pt')?'pt':'en'}}));}
  function settings() {
    ctx.modal('Revisão enquanto você escreve',`<p>A ortografia é verificada neste computador ao terminar a palavra ou fazer uma pausa curta. Clique no alerta para corrigir, consultar o significado ou aceitar um nome próprio.</p><label><input id="live-enabled-toggle" type="checkbox" ${enabled?'checked':''}> Ativar alertas enquanto escrevo</label><label>Idioma do texto<select id="live-language-select"><option value="pt-BR">Português · Brasil</option><option value="pt-PT">Português · Portugal</option><option value="en-US">English · United States</option><option value="en-GB">English · United Kingdom</option></select></label><p class="proof-note">Vermelho: ortografia. Azul: gramática/estilo. O aplicativo só substitui o texto quando você escolhe uma sugestão. Links, referências e código ficam protegidos.</p><h3>Regras básicas locais</h3><p>Algumas sugestões de saudação, pontuação e uso do pronome inglês “I” já funcionam sem instalação. São regras limitadas: não verificam toda a gramática nem interpretam todas as frases.</p><h3>Gramática ampliada local</h3><p>Para ampliar a análise das frases, abra “Configurar gramática” no menu Iniciar do Windows instalado. Na versão ZIP do Windows, use <code>setup-writing.cmd</code>; no Arch, execute <code>bash setup-writing.sh --portable-java</code>. Isso baixa o LanguageTool e, se necessário, o Java portátil. Após instalar, volte a escrever; o motor é detectado automaticamente.</p><p class="proof-note">A primeira análise gramatical pode levar alguns segundos para iniciar o motor. Nenhuma nota é enviada. A checagem usa regras locais e pode não encontrar todos os problemas.</p><button class="secondary" id="live-reset-words">Redefinir palavras aceitas neste navegador</button>`);
    const select=document.querySelector('#live-language-select');select.value=ctx.language();select.onchange=()=>{ctx.setLanguage(select.value);if(active?.el.isConnected)schedule(active,true);};
    document.querySelector('#live-enabled-toggle').onchange=event=>{enabled=event.target.checked;try{localStorage.setItem('trama-live-writing',enabled?'on':'off');}catch{}for(const state of connectedStates){state.sequence++;clearTimeout(state.spellTimer);clearTimeout(state.grammarTimer);clearTimeout(state.localTimer);state.spell=[];state.local=[];state.grammar=[];state.selected=null;if(state.el.isConnected)paint(state);}if(active?.el.isConnected)schedule(active,true);};
    document.querySelector('#live-reset-words').onclick=()=>{ignored={};try{localStorage.removeItem('trama-spell-ignored');}catch{}if(active?.el.isConnected)schedule(active,true);ctx.toast('As palavras aceitas voltaram a ser verificadas.');};
  }

  document.addEventListener('trama:typography',()=>{for(const state of connectedStates)syncMirror(state);});
  document.addEventListener('focusin',event=>{if(event.target.matches?.(selector)){const state=attach(event.target);schedule(state,true);}});
  document.addEventListener('input',event=>{if(event.target.matches?.(selector))schedule(attach(event.target));});
  document.addEventListener('compositionstart',event=>{const state=states.get(event.target);if(state){state.composing=true;clearTimeout(state.spellTimer);clearTimeout(state.grammarTimer);clearTimeout(state.localTimer);state.sequence++;}});
  document.addEventListener('compositionend',event=>{if(event.target.matches?.(selector)){const state=attach(event.target);state.composing=false;schedule(state);}});
  document.addEventListener('click',event=>{if(event.target.closest('[data-writing-settings]'))settings();});
  document.addEventListener('keydown',event=>{if(event.altKey&&event.shiftKey&&event.key.toLowerCase()==='d'&&active?.el.isConnected){event.preventDefault();event.stopPropagation();dictionary(wordAtSelection(active.el),language(active.el));}},true);
  return {settings,refresh(){if(active?.el.isConnected)schedule(active,true);}};
}
