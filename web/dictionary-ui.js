import * as C from './core.js';
import {WORD_LESSONS} from './learning-content.js';
import {partOfSpeechHelp} from './learning-support.js';
import {spellingRequest} from './spell-client.js';
import {wordAtSelection} from './live-writing.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeURL=value=>{try{const url=new URL(value);return url.protocol==='https:'?url.href:'#';}catch{return '#';}};
const plain=value=>String(value??'').replace(/\[\[/g,'［［').replace(/\]\]/g,'］］').replace(/\{\{/g,'｛｛').replace(/\}\}/g,'｝｝').replace(/\(\(/g,'（（').replace(/\)\)/g,'））');

export function setupDictionary(ctx) {
  const dialog=document.createElement('dialog');dialog.id='dictionary-dialog';dialog.setAttribute('aria-label','Dicionário português e inglês');document.body.append(dialog);
  let requestId=0,selection='',selectedLanguage='pt';
  const $=selector=>dialog.querySelector(selector);
  dialog.addEventListener('keydown',event=>event.stopPropagation());dialog.addEventListener('click',event=>event.stopPropagation());dialog.addEventListener('close',()=>requestId++);
  function open(word='',language=ctx.language().startsWith('pt')?'pt':'en') {
    requestId++;
    dialog.innerHTML=`<div class="modal-head"><div><span class="dictionary-eyebrow">PALAVRAS E SIGNIFICADOS</span><h2>Dicionário local</h2></div><button id="dictionary-close" aria-label="Fechar dicionário">✕</button></div><div class="modal-body"><form id="dictionary-search"><label>Palavra ou expressão<input id="dictionary-word" type="text" maxlength="160" autocomplete="off" value="${esc(word)}" placeholder="Ex.: clareza, confiança, confidence"></label><label>Idioma<select id="dictionary-language"><option value="pt">Português</option><option value="en">English · definições simples</option></select></label><button class="primary" type="submit">Consultar</button></form><p class="dictionary-note">Consulta offline. Português: Wikcionário. Inglês: Simple English Wiktionary, com definições em inglês simplificado. Selecione uma palavra no editor e use Alt + Shift + D.</p><div id="dictionary-results" aria-live="polite"><p>Consulte uma palavra para ver seus significados e exemplos de uso.</p></div></div>`;
    $('#dictionary-language').value=language;$('#dictionary-close').onclick=()=>dialog.close();
    $('#dictionary-language').setAttribute('aria-label','Idioma');
    $('#dictionary-word').oninput=()=>{requestId++;$('#dictionary-results').textContent='Clique em Consultar para buscar a palavra digitada.';};
    $('#dictionary-search').onsubmit=event=>{event.preventDefault();lookup();};
    $('#dictionary-language').onchange=()=>{requestId++;$('#dictionary-results').textContent='Clique em Consultar para buscar no idioma escolhido.';};
    if(!dialog.open)dialog.showModal();$('#dictionary-word').focus();if(word.trim())lookup();
  }
  function studySection(word,language) {
    const normalized=word.normalize('NFC').toLocaleLowerCase();
    const lesson=WORD_LESSONS.find(item=>item.language===language&&item.word.normalize('NFC').toLocaleLowerCase()===normalized);
    const section=document.createElement('section');section.className='dictionary-study';
    section.innerHTML=lesson?`<span class="dictionary-eyebrow">EXEMPLOS PARA ESTUDO · TRAMA</span><h3>Use “${esc(lesson.word)}” na sua escrita</h3><p>${esc(lesson.usage)}</p>${lesson.examples.map(example=>`<blockquote><p lang="${language}">${esc(example.text)}</p><small lang="${language==='pt'?'en':'pt'}">${esc(example.translation)}</small></blockquote>`).join('')}<button type="button" class="primary" data-dictionary-learn>Praticar esta palavra</button>`:`<h3>Transforme a consulta em aprendizado</h3><p>Guarde o significado, escreva uma frase sua e volte a revisar. A área de estudo também oferece palavras novas com exemplos nos dois idiomas.</p><button type="button" class="primary" data-dictionary-learn>Aprender esta palavra</button>`;
    section.querySelector('[data-dictionary-learn]').onclick=()=>{dialog.close();document.dispatchEvent(new CustomEvent('trama:learn',{detail:{word,language}}));};
    $('#dictionary-results').append(section);
  }
  async function lookup() {
    const word=$('#dictionary-word').value.trim(),language=$('#dictionary-language').value,id=++requestId;
    if(!word){$('#dictionary-results').textContent='Digite uma palavra ou expressão.';return;}
    $('#dictionary-results').textContent='Consultando a base local…';
    try{
      const response=await fetch('/api/dictionary',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({word,language})});const result=await response.json();if(id!==requestId||!dialog.open)return;if(!response.ok)throw Error(result.error||'Não foi possível abrir o dicionário.');
      if(!result.found){$('#dictionary-results').innerHTML=`<p>${esc(result.notice)}</p><div id="dictionary-alternatives"></div>`;studySection(word,language);try{const suggestions=await spellingRequest({action:'suggest',word,language:language==='pt'?'pt-BR':'en-US'});if(id!==requestId)return;$('#dictionary-alternatives').innerHTML=(suggestions.replacements||[]).slice(0,7).map((item,index)=>`<button class="secondary" data-dictionary-suggestion="${index}">${esc(item.value)}</button>`).join('');dialog.querySelectorAll('[data-dictionary-suggestion]').forEach(button=>button.onclick=()=>{$('#dictionary-word').value=suggestions.replacements[Number(button.dataset.dictionarySuggestion)].value;lookup();});}catch{}return;}
      $('#dictionary-results').innerHTML=`<p class="dictionary-count">${esc(result.notice)} ${result.entries.length} ${result.entries.length===1?'entrada':'entradas'}.</p>${result.entries.slice(0,15).map((entry,index)=>`<article class="dictionary-entry"><header><h3>${esc(entry.word)}</h3><span>${esc(entry.partOfSpeech)}</span></header>${partOfSpeechHelp(entry.partOfSpeech)?`<p class="dictionary-note">${esc(partOfSpeechHelp(entry.partOfSpeech))}</p>`:''}<ol>${entry.definitions.slice(0,12).map(sense=>`<li>${esc(sense.definition)}${(sense.examples||[]).slice(0,3).map(example=>`<blockquote>${esc(example.text)}${example.reference?`<cite>${esc(example.reference)}</cite>`:''}</blockquote>`).join('')}</li>`).join('')}</ol>${entry.definitions.some(sense=>sense.examples?.length)?'':'<p class="dictionary-note">Este verbete explica o significado, mas não traz uma frase de exemplo da fonte. Os exemplos preparados pelo Trama, quando houver uma lição correspondente, aparecem na seção de estudo abaixo.</p>'}<div class="dictionary-entry-actions"><button class="secondary" data-dictionary-save="${index}">Guardar significado</button><a href="${esc(safeURL(entry.source.url))}" target="_blank" rel="noopener noreferrer">${esc(entry.source.name)} ↗</a></div></article>`).join('')}${result.truncated||result.entries.length>15?'<p class="dictionary-note">Exibindo as primeiras entradas. Consulte a fonte para a lista completa.</p>':''}<p class="dictionary-attribution">Colaboradores do Wikcionário/Wiktionary · extração <a href="${esc(safeURL(result.entries[0].source.via))}" target="_blank" rel="noopener noreferrer">Wiktextract/Kaikki</a> · <a href="${esc(safeURL(result.entries[0].source.licenseUrl))}" target="_blank" rel="noopener noreferrer">${esc(result.entries[0].source.license)}</a>. Dados filtrados e reorganizados para consulta local.</p>`;
      studySection(word,language);
      dialog.querySelectorAll('[data-dictionary-save]').forEach(button=>button.onclick=async()=>{
        button.disabled=true;let created=false;
        try{const entry=result.entries[Number(button.dataset.dictionarySave)],sense=entry.definitions[0];ctx.checkpoint();const page=C.ensurePage(ctx.data,'Vocabulário · Português e English'),card=C.newBlock(`${plain(entry.word)} #trama/dicionario`);card.children=[C.newBlock(`${plain(entry.partOfSpeech)} · ${language==='pt'?'Português':'English'}`),C.newBlock(`Significado: ${plain(sense.definition)}`),...(sense.examples||[]).slice(0,2).map(example=>C.newBlock(`Exemplo: ${plain(example.text)}`)),C.newBlock(`Fonte: [${plain(entry.source.name)}](${safeURL(entry.source.url)}) · [${entry.source.license}](${safeURL(entry.source.licenseUrl)}) · extração Wiktextract/Kaikki; dados reorganizados.`)];if(page.blocks.length===1&&!page.blocks[0].text&&!page.blocks[0].children.length)page.blocks=[card];else page.blocks.push(card);created=true;ctx.changed(page.id);ctx.render();button.textContent='Significado adicionado';if(!await ctx.flush())throw Error('O significado foi adicionado, mas ainda não foi salvo no disco. Confira o indicador de salvamento.');ctx.toast('Significado guardado no seu vocabulário.');}catch(error){ctx.toast(error.message);if(!created)button.disabled=false;}
      });
    }catch(error){if(id===requestId)$('#dictionary-results').innerHTML=`<p class="error-banner">${esc(error.message)}</p>`;}
  }
  document.addEventListener('pointerdown',event=>{if(event.target.closest('[data-dictionary-open]')){selection=wordAtSelection(document.activeElement);const language=document.activeElement?.lang||ctx.language();selectedLanguage=language.startsWith('en')?'en':'pt';}},true);
  document.addEventListener('click',event=>{if(event.target.closest('[data-dictionary-open]'))open(selection,selectedLanguage);});
  document.addEventListener('trama:dictionary',event=>open(event.detail?.word||'',event.detail?.language||'pt'));
  return {open};
}
