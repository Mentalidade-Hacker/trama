import {protectedRanges} from './proofread.js';

/** Small, offline prose rules; these are suggestions, not a full grammar checker. */
export function checkWritingRules(text,language='pt-BR') {
  if(typeof text!=='string')throw Error('O texto para revisão precisa ser uma string.');
  const lang=String(language).toLowerCase().replace('_','-');
  if(!/^(?:pt|en)(?:-|$)/.test(lang))return [];
  const ranges=protectedRanges(text);
  // Also protect bare addresses and non-HTTP URLs, outside Markdown syntax.
  for(const match of text.matchAll(/[\p{L}\p{N}._%+\-]+@[\p{L}\p{N}.\-]+\.[\p{L}]{2,}|(?:[a-z][a-z0-9+.-]*:\/\/|www\.)[^\s<>"`]+/giu))ranges.push([match.index,match.index+match[0].length]);
  ranges.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const merged=[];
  for(const range of ranges){const last=merged.at(-1);if(last&&range[0]<=last[1])last[1]=Math.max(last[1],range[1]);else merged.push([...range]);}
  function protectedAt(start,end){
    let left=0,right=merged.length;
    while(left<right){const mid=(left+right)>>1;if(merged[mid][1]<=start)left=mid+1;else right=mid;}
    return left<merged.length&&merged[left][0]<end;
  }
  const result=[];
  function add(offset,length,replacement,id,message,issueType='grammar',guardStart=offset){
    if(protectedAt(guardStart,offset+length))return;
    result.push({offset,length,message,replacements:[{value:replacement}],source:'local-basic',
      rule:{id,issueType,description:message,category:{id:'LOCAL_BASIC',name:'Regras básicas locais'}}});
  }
  if(lang.startsWith('pt')){
    // Require sentence-initial position AND a greeting continuation. A proper
    // name such as "Ola chegou" must not be treated as a misspelling.
    const greeting=/(?:^|[.!?\r\n])[\p{Zs}\t"“‘'(\p{Extended_Pictographic}\uFE0F\u200D]*([Oo]la)(?=$|[\s,.;:!?])/gu;
    for(const match of text.matchAll(greeting)){
      const offset=match.index+match[0].length-match[1].length,after=text.slice(offset+3);
      if(!/^(?:[ \t]*(?:$|[,!?…])|[ \t]+(?:tudo[ \t]+bem|como[ \t]+(?:vai|você|voce|está|esta)|bom[ \t]+dia|boa[ \t]+(?:tarde|noite)|pessoal|gente|amig[oa]s?|a[ \t]+todos|mundo)(?![\p{L}\p{M}\p{N}_]))/iu.test(after))continue;
      add(offset,3,'Olá','LOCAL_PT_GREETING','Se a intenção é cumprimentar, escreva “Olá”, com acento.','misspelling');
    }
  }
  if(lang.startsWith('en')){
    for(const match of text.matchAll(/(?<![\p{L}\p{M}\p{N}_])i(?![\p{L}\p{M}\p{N}_])/gu)){
      const after=text.slice(match.index+1);
      if(!/^(?:['’](?:m|ve|d|ll)|[ \t]+(?:am|was|have|had|will|would|can|could|should|shall|must|might|may|do|did|don['’]t|didn['’]t|think|believe|know|want|need|like|love|hope|work|study|feel|see|agree|understand|write|wrote|read|saw|went|learn|learned|live|lived|said|say|try|tried|prefer|remember|forgot|forgotten|plan|use|used|look|looked|wish))(?![\p{L}\p{M}\p{N}_])/iu.test(after))continue;
      add(match.index,1,'I','LOCAL_EN_PRONOUN_I','Em inglês, o pronome “I” (eu) é escrito com letra maiúscula.');
    }
  }
  for(const match of text.matchAll(/[\p{L}\p{M}\p{N}]([ \t\u00a0]+)([.,;:!?])/gu)){
    const offset=match.index+match[0].length-match[1].length-match[2].length;
    add(offset,match[1].length+1,match[2],'LOCAL_PUNCTUATION_SPACE',
      'Em português e inglês, esta pontuação fica junto da palavra anterior, sem espaço antes.','typographical',match.index);
  }
  return result.sort((a,b)=>a.offset-b.offset||a.length-b.length);
}

/** Earlier lists take precedence on overlap; preserve the supplied matches. */
export function mergeWritingMatches(...lists) {
  const result=[];
  for(const list of lists)for(const match of list||[]){
    if(!Number.isInteger(match?.offset)||match.offset<0||!Number.isInteger(match.length)||match.length<0)continue;
    const overlaps=other=>match.length===0&&other.length===0?match.offset===other.offset
      :match.length===0?match.offset>other.offset&&match.offset<other.offset+other.length
      :other.length===0?other.offset>match.offset&&other.offset<match.offset+match.length
      :match.offset<other.offset+other.length&&match.offset+match.length>other.offset;
    if(!result.some(overlaps))result.push(match);
  }
  return result.sort((a,b)=>a.offset-b.offset||a.length-b.length);
}
