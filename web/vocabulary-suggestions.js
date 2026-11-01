import * as C from './core.js';
import {protectedRanges,applySuggestion} from './proofread.js';
import {saveReviewCard,readLearning,validateLesson} from './learning-core.js';
import {escapeHTML as esc} from './renderer.js';
import {VOCABULARY_FAMILIES} from './vocabulary-data.js';

const fold=value=>value.normalize('NFC').toLocaleLowerCase();
const languageOf=value=>String(value||'').startsWith('en')?'en':'pt';
const stop={pt:new Set('a o as os um uma uns umas de da do das dos em na no nas nos por para com sem sob sobre entre até ante após pelo pela pelos pelas ao aos à às e ou mas que se como quando onde porque pois não sim já ainda também muito muita muitos muitas mais menos tão tanto tanta tantos tantas todo toda todos todas cada outro outra outros outras mesmo mesma mesmos mesmas meu minha meus minhas seu sua seus suas nosso nossa nossos nossas este esta estes estas esse essa esses essas isto isso aquele aquela aqueles aquelas aquilo eu tu ele ela nós vocês eles elas me te lhe lhes nos vos é são era eram foi foram ser estar está estão estava estavam estou estamos ter tem têm tinha tinham tenho temos há haver pode podem podia deve devem seria seja sejam sendo estar estaríamos bem mal só apenas então aqui ali lá aí sempre nunca antes depois agora assim durante através ambos ambas caso quase talvez qual quais qualquer quem cujo cuja cujos cujas quanto quantos quanta quantas você consigo até'.split(' ')),en:new Set('a an the and or but if then than that this these those of to in on at by for from with without into onto over under between among about through during before after as while when where why how what which who whom whose i you he she it we they me him her us them my your his its our their mine yours ours theirs myself yourself himself herself itself ourselves themselves is are was were be been being am do does did doing have has had having can could may might must shall should will would not no nor yes so too very much many more most less least some any all each every both either neither none such own same other another only just even ever never always often sometimes already still yet here there now then also again perhaps almost enough rather quite because until since although however therefore'.split(' '))};
const families=new Map(VOCABULARY_FAMILIES.map(item=>[item.id,item]));
const forms={pt:new Map(),en:new Map()};
for(const family of VOCABULARY_FAMILIES)family.forms.forEach((word,index)=>forms[family.language].set(fold(word),{family,index}));
const MAX_CHARACTERS=200000;
export const SUGGESTED_VOCABULARY_PAGE='Vocabulário · Português e English';

/** Ignore complete link labels as well as their destinations, and email addresses. */
function vocabularyRanges(text) {
  const ranges=protectedRanges(text);
  for(const match of text.matchAll(/!?\[[^\]\r\n]*\]\(/g)) {
    let cursor=match.index+match[0].length,depth=1;
    while(cursor<text.length&&depth){if(text[cursor]==='\\'){cursor+=2;continue;}if(text[cursor]==='(')depth++;else if(text[cursor]===')')depth--;cursor++;}
    ranges.push([match.index,Math.min(cursor,text.length)]);
  }
  for(const match of text.matchAll(/[^\s<>()]+@[^\s<>()]+\.[^\s<>()]+/gu))ranges.push([match.index,match.index+match[0].length]);
  for(const match of text.matchAll(/https?:\/\/[^\s<>"`]+/giu))ranges.push([match.index,match.index+match[0].length]);
  ranges.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);const merged=[];
  for(const range of ranges){const last=merged.at(-1);if(last&&range[0]<=last[1])last[1]=Math.max(last[1],range[1]);else merged.push([...range]);}
  return merged;
}
function overlaps(ranges,start,length){let low=0,high=ranges.length;while(low<high){const middle=(low+high)>>>1;if(ranges[middle][1]<=start)low=middle+1;else high=middle;}return low<ranges.length&&start+length>ranges[low][0];}

export function vocabularyTokens(text,language='pt') {
  if(typeof text!=='string')throw Error('Texto inválido para explorar vocabulário.');
  language=languageOf(language);const ranges=vocabularyRanges(text),tokens=[];
  for(const match of text.matchAll(/(?<![\p{L}\p{M}\p{N}_])[\p{L}\p{M}]+(?:['’\-][\p{L}\p{M}]+)*(?![\p{L}\p{M}\p{N}_])/gu)) {
    if(overlaps(ranges,match.index,match[0].length))continue;
    const normalized=fold(match[0]);tokens.push({word:match[0],normalized,offset:match.index,length:match[0].length,ignored:stop[language].has(normalized)});
  }
  return tokens;
}

/** A repeated term is a prompt to review, never an assertion that repetition is wrong. */
export function scanVocabulary(data,{pageId,blockId,language='pt',maxGroups=12}={}) {
  language=languageOf(language);const source=blockId?C.findBlock(data,blockId):null;
  const page=source?.page||data.pages.find(item=>item.id===pageId);
  if(!page)throw Error('Abra uma página ou escolha um bloco para explorar o vocabulário.');
  const entries=blockId?(source?[source]:[]):C.walkBlocks([page]);
  const limit=Number.isSafeInteger(maxGroups)?Math.max(1,Math.min(200,maxGroups)):12;
  const grouped=new Map();let position=0,characters=0,truncated=false;
  for(const entry of entries) {
    if(characters>=MAX_CHARACTERS){truncated=true;break;}
    const remaining=MAX_CHARACTERS-characters,text=entry.block.text;
    const inspected=text.length<=remaining?text:text.slice(0,remaining);
    const fullRanges=inspected.length<text.length?vocabularyRanges(text):null;
    if(fullRanges)truncated=true;
    for(const token of vocabularyTokens(inspected,language)) {
      position++;
      // Do not offer a word cut in half at the analysis limit.
      if(inspected.length<text.length&&token.offset+token.length===inspected.length&&/[\p{L}\p{M}]/u.test(text[inspected.length]))continue;
      if(token.ignored)continue;
      if(fullRanges&&overlaps(fullRanges,token.offset,token.length))continue;
      const found=forms[language].get(token.normalized);
      if(!found&&token.normalized.length<4)continue;
      const key=found?.family.id||`repeat:${language}:${token.normalized}`;
      if(!grouped.has(key))grouped.set(key,{id:key,familyId:found?.family.id||null,word:found?.family.word||token.normalized,language,alternatives:found?.family.alternatives||[],occurrences:[],positions:[]});
      const group=grouped.get(key);group.positions.push(position);
      group.occurrences.push({blockId:entry.block.id,pageId:entry.page.id,pageTitle:entry.page.title,offset:token.offset,length:token.length,word:token.word,expectedText:text});
    }
    characters+=inspected.length;
  }
  const groups=[...grouped.values()].flatMap(group=>{
    const count=group.occurrences.length,repeated=count>=4||group.positions.some((value,index)=>index>0&&value-group.positions[index-1]<=80);
    if(!repeated&&!group.familyId)return [];
    return [{...group,count,reason:repeated?'repetition':'optional',first:group.positions[0]}];
  }).sort((a,b)=>(a.reason==='repetition'?0:1)-(b.reason==='repetition'?0:1)||(a.familyId?0:1)-(b.familyId?0:1)||b.count-a.count||a.first-b.first);
  return {pageId:page.id,pageTitle:page.title,blockId:blockId||null,language,groups:groups.slice(0,limit),moreGroups:Math.max(0,groups.length-limit),characters,truncated};
}

function replacementCase(original,replacement) {
  if(original===original.toLocaleUpperCase()&&original!==original.toLocaleLowerCase())return replacement.toLocaleUpperCase();
  if(original[0]===original[0].toLocaleUpperCase()&&original.slice(1)===original.slice(1).toLocaleLowerCase())return replacement[0].toLocaleUpperCase()+replacement.slice(1);
  return replacement;
}
function context(text,offset,length) {
  let start=Math.max(0,offset-100),end=Math.min(text.length,offset+length+140);
  const splits=index=>index>0&&index<text.length&&text.charCodeAt(index-1)>=0xD800&&text.charCodeAt(index-1)<=0xDBFF&&text.charCodeAt(index)>=0xDC00&&text.charCodeAt(index)<=0xDFFF;
  if(splits(start))start--;if(splits(end))end++;
  return {start,end,before:text.slice(start,offset),word:text.slice(offset,offset+length),after:text.slice(offset+length,end)};
}

export function vocabularyChoice(selection) {
  const family=families.get(selection.familyId),alternative=family?.alternatives.find(item=>item.id===selection.alternativeId);
  if(!family||!alternative||typeof selection.expectedText!=='string'||!Number.isInteger(selection.offset)||!Number.isInteger(selection.length))throw Error('Escolha uma alternativa disponível para esta ocorrência.');
  const original=selection.expectedText.slice(selection.offset,selection.offset+selection.length),index=family.forms.findIndex(word=>fold(word)===fold(original));
  if(index<0||overlaps(vocabularyRanges(selection.expectedText),selection.offset,selection.length))throw Error('A ocorrência selecionada não pode ser alterada por esta sugestão.');
  const tokens=vocabularyTokens(selection.expectedText,family.language);
  if(!tokens.some(token=>token.offset===selection.offset&&token.length===selection.length))throw Error('Selecione uma palavra completa fora dos links e do código.');
  const replacement=replacementCase(original,alternative.forms[index]);
  let adjustment='';
  if(family.language==='en') {
    const article=/\b(a|an)\s+$/iu.exec(selection.expectedText.slice(0,selection.offset));
    const vowel=/^[aeiou]/iu.test(replacement)&&!/^useful\b/iu.test(replacement);
    if(article&&fold(article[1])!==(vowel?'an':'a'))adjustment=`Esta troca também pede conferir o artigo anterior (“${article[1]}”). Ajuste a frase e consulte novamente; aqui só trocamos a palavra selecionada.`;
  }
  return {family,alternative,replacement,adjustment,context:context(selection.expectedText,selection.offset,selection.length)};
}

/** Prepare and validate both changes before touching the caller's graph. */
export function prepareVocabularyChange(data,selection,options={}) {
  const found=C.findBlock(data,selection.blockId);
  if(!found||found.block.text!==selection.expectedText)throw Error('O bloco mudou desde a consulta. Consulte as sugestões novamente.');
  const choice=vocabularyChoice(selection);if(choice.adjustment)throw Error(choice.adjustment);
  const after=applySuggestion(found.block.text,selection,choice.replacement,selection.expectedText);
  const baseline=JSON.stringify(data),next=JSON.parse(baseline),target=C.findBlock(next,selection.blockId);
  const operationId=options.operationId||C.uid(),time=new Date(options.now??Date.now()).toISOString(),excerpt=choice.context;
  const lesson=validateLesson({id:`vocabulary:${choice.family.id}:${choice.alternative.id}`,kind:'word',language:choice.family.language,word:choice.alternative.word,partOfSpeech:choice.family.partOfSpeech,meaning:choice.alternative.meaning,usage:choice.alternative.usage,examples:choice.alternative.examples,
    before:excerpt.before+excerpt.word+excerpt.after,after:excerpt.before+choice.replacement+excerpt.after,
    explanation:`Uma escolha de vocabulário no seu texto: “${excerpt.word}” → “${choice.replacement}”. A alternativa não é uma correção obrigatória e depende do sentido da frase.`,
    prompt:`Escreva uma frase nova com “${choice.alternative.word}”, usando o sentido explicado. Compare com o exemplo antes de avaliar sua lembrança.`});
  const card=saveReviewCard(next,lesson,{now:time,operationId});
  const origin=`Origem: [[${found.page.title}]] ((${found.block.id}))`;
  if(!card.block.children.some(block=>block.text===origin))card.block.children.push(C.newBlock(origin));
  const vocabularyPage=C.ensurePage(next,SUGGESTED_VOCABULARY_PAGE);
  const marker='```trama-vocabulary-choice-v1\n'+JSON.stringify({version:1,lessonId:lesson.id})+'\n```';
  let vocabularyBlock=vocabularyPage.blocks.find(block=>block.children.some(child=>child.text===marker));
  if(!vocabularyBlock){
    vocabularyBlock=C.newBlock(`${choice.alternative.word} #trama/vocabulario`);
    vocabularyBlock.children=[C.newBlock(`Significado: ${choice.alternative.meaning}`),C.newBlock(`Uso: ${choice.alternative.usage}`),
      ...choice.alternative.examples.map(example=>C.newBlock(`Exemplo: ${example.text}`)),
      C.newBlock('Fonte: alternativas e exemplos autorais do Trama para estudo; confira o sentido no contexto.'),C.newBlock(marker)];
    if(vocabularyPage.blocks.length===1&&!vocabularyPage.blocks[0].text&&!vocabularyPage.blocks[0].children.length)vocabularyPage.blocks=[vocabularyBlock];else vocabularyPage.blocks.push(vocabularyBlock);
  }
  const reviewLink=`Revisão espaçada: [[${card.page.title}]] ((${card.block.id}))`;
  const review=vocabularyBlock.children.find(block=>block.text.startsWith('Revisão espaçada:'));
  if(review)review.text=reviewLink;else vocabularyBlock.children.push(C.newBlock(reviewLink));
  if(!vocabularyBlock.children.some(block=>block.text===origin))vocabularyBlock.children.push(C.newBlock(origin));
  vocabularyPage.updated=time;
  target.block.text=after;target.page.updated=time;
  C.importData(next); // Validation only: keep any additional supported metadata in the copied graph.
  return {data:next,baseline,blockId:found.block.id,pageId:found.page.id,lessonId:lesson.id,cardBlockId:card.block.id,vocabularyBlockId:vocabularyBlock.id,vocabularyMarker:marker,reviewLink,operationId,before:selection.expectedText,after,replacement:choice.replacement};
}

function hasVocabularyEntry(data,prepared){const entry=C.findBlock(data,prepared.vocabularyBlockId)?.block;return !!entry?.children.some(block=>block.text===prepared.vocabularyMarker)&&entry.children.some(block=>block.text===prepared.reviewLink);}

export function commitVocabularyChange(data,prepared) {
  if(JSON.stringify(data)!==prepared.baseline)throw Error('O grafo mudou antes da aplicação. Consulte as sugestões novamente.');
  C.importData(prepared.data);
  const target=C.findBlock(prepared.data,prepared.blockId),card=readLearning(prepared.data).cards.get(prepared.lessonId);
  if(target?.block.text!==prepared.after||!card?.state.operations.includes(prepared.operationId)||!hasVocabularyEntry(prepared.data,prepared))throw Error('A alteração, seu cartão e a entrada no vocabulário precisam estar completos antes de salvar.');
  // One synchronous assignment makes the replacement and its card visible together.
  data.pages=prepared.data.pages;
  return prepared;
}

/** A failed disk save keeps the paired change pending, without creating another card on retry. */
export function createVocabularyWriter(ctx) {
  let busy=false,pending=null;
  function verifyPending(){
    if(!pending)return;
    const block=C.findBlock(ctx.data,pending.blockId)?.block,card=readLearning(ctx.data).cards.get(pending.lessonId);
    if(block?.text!==pending.after||!card?.state.operations.includes(pending.operationId)||!hasVocabularyEntry(ctx.data,pending)){
      pending=null;throw Error('A alteração ou o cartão mudou nesta janela. Confira as notas antes de consultar outra sugestão.');
    }
  }
  async function savePending(){verifyPending();if(!await ctx.flush())throw Error('A palavra e o cartão estão juntos nesta janela, mas o salvamento ainda não foi confirmado. Resolva o aviso de salvamento e tente novamente.');verifyPending();const result=pending;pending=null;return result;}
  return {get busy(){return busy;},get pending(){return pending;},
    async commit(selection,options={}){
      if(busy||pending)throw Error('Conclua o salvamento pendente antes de outra sugestão.');
      busy=true;ctx.syncHold?.('vocabulary-write');
      try{
        if(!await ctx.flush())throw Error('Há alterações pendentes ou um conflito. Salve as notas antes de aplicar a sugestão.');
        const prepared=prepareVocabularyChange(ctx.data,selection,options);
        ctx.checkpoint();commitVocabularyChange(ctx.data,prepared);pending=prepared;ctx.changed(prepared.pageId);ctx.render();
        return await savePending();
      }finally{busy=false;ctx.syncRelease?.('vocabulary-write');}
    },
    async retry(){if(busy||!pending)return null;busy=true;ctx.syncHold?.('vocabulary-write');try{return await savePending();}finally{busy=false;ctx.syncRelease?.('vocabulary-write');}},
  };
}

export function setupVocabulary(ctx) {
  const dialog=document.createElement('dialog');dialog.id='vocabulary-dialog';dialog.setAttribute('aria-label','Explorar vocabulário');document.body.append(dialog);
  const writer=createVocabularyWriter(ctx),$=selector=>dialog.querySelector(selector);
  let analysis=null,selectedGroup=0,selectedOccurrence=0,displayLimit=12,message='',error='',hints=false,hint=null,lastEditor=null,timer=null,composing=false;
  try{hints=localStorage.getItem('trama-vocabulary-hints')==='on';}catch{}
  const group=()=>analysis?.groups[selectedGroup],occurrence=()=>group()?.occurrences[selectedOccurrence];
  function selection(alternativeId){return {...occurrence(),familyId:group().familyId,alternativeId};}
  function excerptHTML(item){const c=context(item.expectedText,item.offset,item.length);return `${c.start?'…':''}${esc(c.before)}<mark>${esc(c.word)}</mark>${esc(c.after)}${c.end<item.expectedText.length?'…':''}`;}
  function bodyHTML(){
    const item=group(),selected=occurrence();
    if(!item)return '<p class="vocab-empty">Não há sugestões na parte analisada. Isso não é uma nota de qualidade: manter palavras claras e repetir termos importantes pode ser a melhor escolha.</p>';
    return `<div class="vocab-layout"><nav class="vocab-word-list" aria-label="Palavras para explorar">${analysis.groups.map((entry,index)=>`<button type="button" data-vocab-group="${index}" aria-pressed="${index===selectedGroup}"><strong>${esc(entry.word)}</strong><small>${entry.reason==='repetition'?`${entry.count} ocorrências · rever repetição`:'Escolha opcional de vocabulário'}</small></button>`).join('')}</nav><section class="vocab-detail"><h3>${esc(item.word)}</h3><p>${item.reason==='repetition'?'A repetição pode ser necessária para manter o assunto preciso. Considere variar apenas se isso ajudar o leitor.':'Esta palavra pode funcionar muito bem. Explore outra opção apenas se ela expressar melhor o sentido desejado.'}</p><label>Ocorrência que quero revisar<select data-vocab-occurrence>${item.occurrences.slice(0,40).map((entry,index)=>`<option value="${index}" ${index===selectedOccurrence?'selected':''}>${index+1} · ${esc(entry.expectedText.slice(Math.max(0,entry.offset-25),entry.offset+entry.length+40).replace(/\s+/g,' '))}</option>`).join('')}</select></label>${item.count>40?'<small>Mostrando as primeiras 40 ocorrências. Abra um bloco específico para reduzir o escopo.</small>':''}<div class="vocab-context" lang="${analysis.language}">${excerptHTML(selected)}</div>${item.alternatives.length?`<p class="proof-note">Confira a classe da palavra, o sentido e a concordância no seu texto. Estas alternativas foram preparadas para estudo; não são uma correção automática.</p>${item.alternatives.map(alternative=>{
      const choice=vocabularyChoice(selection(alternative.id)),c=choice.context;
      return `<article class="vocab-alternative"><h4>${esc(choice.replacement)}</h4><p>${esc(alternative.meaning)}</p><p class="vocab-usage">${esc(alternative.usage)}</p>${alternative.examples.map(example=>`<blockquote lang="${analysis.language}">${esc(example.text)}</blockquote>`).join('')}<div class="vocab-proposal"><small>Como ficaria neste trecho</small><p lang="${analysis.language}">${c.start?'…':''}${esc(c.before)}<strong>${esc(choice.replacement)}</strong>${esc(c.after)}${c.end<selected.expectedText.length?'…':''}</p></div>${choice.adjustment?`<p class="vocab-notice">${esc(choice.adjustment)}</p>`:''}<button class="primary" type="button" data-vocab-apply="${esc(alternative.id)}" ${writer.busy||writer.pending||choice.adjustment?'disabled':''}>Usar nesta ocorrência e guardar para revisão</button></article>`;
    }).join('')}`:'<p>Não há uma alternativa contextualizada na coleção para esta palavra. Você pode manter o termo, consultar seu significado ou reescrever a frase. Não sugerimos uma troca inventada.</p>'}<div class="vocab-actions"><button class="secondary" type="button" data-vocab-dictionary>Consultar significado</button><button class="secondary" type="button" data-vocab-keep>Manter a palavra e continuar</button></div></section></div>`;
  }
  function render(){
    dialog.innerHTML=`<header class="vocab-header"><div><small>ESCOLHAS PARA ESCREVER COM PRECISÃO</small><h2>Explorar vocabulário</h2><p>Uma palavra mais longa não é necessariamente melhor. Compare o sentido antes de trocar.</p></div><button type="button" data-vocab-close aria-label="Fechar sugestões">✕</button></header><div class="vocab-toolbar"><label>Idioma<select data-vocab-language ${writer.busy||writer.pending?'disabled':''}><option value="pt" ${analysis?.language==='pt'?'selected':''}>Português</option><option value="en" ${analysis?.language==='en'?'selected':''}>English</option></select></label><span>${esc(analysis?.pageTitle||'')} · ${analysis?.blockId?'bloco escolhido':'página e seus blocos'}</span><button class="secondary" type="button" data-vocab-refresh ${writer.busy||writer.pending?'disabled':''}>Consultar novamente</button>${analysis?.blockId?'<button class="secondary" type="button" data-vocab-page>Ver página inteira</button>':''}</div><div class="vocab-body">${message?`<p class="vocab-success" role="status">${esc(message)}</p>`:''}${error?`<p class="vocab-error" role="alert">${esc(error)}</p>`:''}${writer.busy?'<p role="status">Salvando a palavra e o cartão juntos…</p>':''}${writer.pending&&!writer.busy?'<p class="vocab-notice">A alteração está pendente de confirmação no disco.</p><button class="primary" type="button" data-vocab-retry>Tentar salvar a mesma alteração</button>':''}${analysis?.truncated?'<p class="vocab-notice">A consulta analisou até 200 mil caracteres. Abra um bloco específico para explorar partes que não entraram neste limite.</p>':''}${bodyHTML()}${analysis?.moreGroups?`<p class="proof-note">Há mais ${analysis.moreGroups} palavras na análise. Abra um bloco específico para concentrar a consulta.</p>`:''}<label class="vocab-hints"><input type="checkbox" data-vocab-hints ${hints?'checked':''}> Mostrar um convite discreto ao escrever, após uma pausa</label><p class="proof-note">Desligado por padrão. O convite nunca abre esta tela sozinho nem troca palavras. As sugestões são locais; a coleção de alternativas é finita.</p></div>`;
    if(analysis?.moreGroups&&displayLimit<200){const more=document.createElement('button');more.type='button';more.dataset.vocabMore='';more.textContent='Ver mais palavras';more.disabled=writer.busy||!!writer.pending;$('.vocab-word-list')?.append(more);}
  }
  function refresh({language=analysis?.language||languageOf(ctx.language?.()),blockId=analysis?.blockId,pageId=analysis?.pageId||ctx.page?.id}={}) {
    if(writer.busy||writer.pending){ctx.toast('Conclua o salvamento pendente antes de consultar novamente.');return;}
    try{analysis=scanVocabulary(ctx.data,{pageId,blockId,language,maxGroups:displayLimit});selectedGroup=0;selectedOccurrence=0;error='';render();}catch(failure){ctx.toast(failure.message);}
  }
  function open(options={}) {
    if(writer.busy){ctx.toast('Aguarde o salvamento da sugestão.');return;}
    if(!writer.pending){message='';error='';analysis=null;displayLimit=12;refresh({pageId:options.pageId||ctx.page?.id,blockId:options.blockId,language:languageOf(options.language||ctx.language?.())});}
    else render();
    if(analysis&&!dialog.open){ctx.syncHold?.('vocabulary-dialog');dialog.showModal();}
  }
  async function apply(alternativeId){
    if(writer.busy||writer.pending)return;const chosen=selection(alternativeId);error='';message='';
    const action=writer.commit(chosen);render();
    try{const saved=await action;message=`“${saved.replacement}” foi aplicada nesta ocorrência e guardada em Meu vocabulário. O cartão está em Aprender a escrever → Revisar; ele não conta como uma frase própria praticada.`;refresh();}
    catch(failure){error=failure.message;render();}
  }
  function removeHint(){hint?.remove();hint=null;}
  function scheduleHint(editor){
    clearTimeout(timer);lastEditor=editor;
    if(!hints||composing||!editor?.isConnected){removeHint();return;}
    timer=setTimeout(()=>{
      if(!editor.isConnected||document.activeElement!==editor||composing)return;
      const id=editor.dataset.editor;if(!id)return;
      try{const result=scanVocabulary(ctx.data,{blockId:id,language:languageOf(ctx.language?.()),maxGroups:3});removeHint();if(!result.groups.length)return;
        hint=document.createElement('button');hint.type='button';hint.className='vocabulary-hint';hint.textContent='Explorar escolhas de vocabulário';hint.onclick=()=>open({blockId:id});
        (editor.closest('.live-editor-shell')||editor).after(hint);
      }catch{removeHint();}
    },1800);
  }
  dialog.addEventListener('close',()=>ctx.syncRelease?.('vocabulary-dialog'));
  dialog.addEventListener('keydown',event=>event.stopPropagation());
  dialog.addEventListener('click',event=>{
    event.stopPropagation();const target=event.target;
    if(target.closest('[data-vocab-close]'))dialog.close();
    const word=target.closest('[data-vocab-group]');if(word&&!writer.busy&&!writer.pending){selectedGroup=Number(word.dataset.vocabGroup);selectedOccurrence=0;error='';render();}
    const alternative=target.closest('[data-vocab-apply]');if(alternative)void apply(alternative.dataset.vocabApply);
    if(target.closest('[data-vocab-refresh]'))refresh();
    if(target.closest('[data-vocab-more]')&&!writer.busy&&!writer.pending){displayLimit+=12;refresh();}
    if(target.closest('[data-vocab-page]'))refresh({blockId:null});
    if(target.closest('[data-vocab-keep]')&&!writer.busy&&!writer.pending){selectedGroup=(selectedGroup+1)%Math.max(analysis.groups.length,1);selectedOccurrence=0;render();}
    if(target.closest('[data-vocab-dictionary]')&&group()){const word=occurrence()?.word||group().word,language=analysis.language;dialog.close();document.dispatchEvent(new CustomEvent('trama:dictionary',{detail:{word,language}}));}
    if(target.closest('[data-vocab-retry]')){error='';const action=writer.retry();render();void action.then(saved=>{if(saved){message='A palavra e o cartão foram salvos.';refresh();}}).catch(failure=>{error=failure.message;render();});}
  });
  dialog.addEventListener('change',event=>{
    if(event.target.matches('[data-vocab-language]')){refresh({language:event.target.value});$('[data-vocab-language]')?.focus({preventScroll:true});}
    if(event.target.matches('[data-vocab-occurrence]')&&!writer.busy&&!writer.pending){selectedOccurrence=Number(event.target.value);render();$('[data-vocab-occurrence]')?.focus({preventScroll:true});}
    if(event.target.matches('[data-vocab-hints]')){hints=event.target.checked;try{localStorage.setItem('trama-vocabulary-hints',hints?'on':'off');}catch{}if(hints)scheduleHint(lastEditor);else removeHint();}
  });
  document.addEventListener('click',event=>{const trigger=event.target.closest('[data-vocabulary-suggest]');if(trigger){event.preventDefault();open({blockId:trigger.dataset.vocabularyBlock||undefined});}});
  document.addEventListener('trama:vocabulary',event=>open(event.detail||{}));
  document.addEventListener('input',event=>{if(event.target.matches?.('.block-editor'))scheduleHint(event.target);});
  document.addEventListener('compositionstart',event=>{if(event.target.matches?.('.block-editor')){composing=true;clearTimeout(timer);removeHint();}});
  document.addEventListener('compositionend',event=>{if(event.target.matches?.('.block-editor')){composing=false;scheduleHint(event.target);}});
  document.addEventListener('focusout',event=>{if(composing&&event.target.matches?.('.block-editor')){composing=false;clearTimeout(timer);removeHint();}});
  return {open,check:options=>scanVocabulary(ctx.data,{pageId:ctx.page?.id,language:languageOf(ctx.language?.()),...options}),dialog,writer,close:()=>dialog.close()};
}
