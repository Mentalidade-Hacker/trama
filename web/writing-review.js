import {spellingRequest} from './spell-client.js';
import {checkWritingRules,mergeWritingMatches} from './writing-rules.js';
import {isProtectedRange,maskMarkup} from './proofread.js';

async function grammarRequest(text,language,signal) {
  const res=await fetch('/api/proofread',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:maskMarkup(text),language}),signal});
  const out=await res.json();
  if(res.status===503)throw Error('indisponível; consulte o assistente Configurar gramática');
  if(!res.ok)throw Error(out.error||'Gramática ampliada indisponível');return out;
}

export async function reviewWriting(text,language,{spell=spellingRequest,grammar=grammarRequest,signal}={}) {
  if(typeof text!=='string'||text.length>20000)throw Error('A revisão aceita até 20 mil caracteres por bloco.');
  const local=checkWritingRules(text,language);
  const results=await Promise.allSettled([
    Promise.resolve().then(()=>spell({action:'check',text,language,checkCurrent:true})),
    Promise.resolve().then(()=>grammar(text,language,signal))
  ]);
  const warnings=[];
  const lists=[local,...results.map((result,index)=>{
    if(result.status==='fulfilled')return result.value.matches||[];
    warnings.push((index?'Gramática ampliada: ':'Ortografia: ')+(result.reason?.message||'indisponível'));return [];
  })];
  const matches=mergeWritingMatches(...lists.map(list=>list.filter(item=>Number.isSafeInteger(item.offset)&&Number.isSafeInteger(item.length)&&item.length>=0&&item.offset>=0&&item.offset+item.length<=text.length&&!isProtectedRange(text,item.offset,item.length))));
  const suggestions=new Map();
  for(const match of matches.filter(x=>x.rule?.issueType==='misspelling'&&!x.replacements?.length).slice(0,20)){
    const word=text.slice(match.offset,match.offset+match.length);
    if(!suggestions.has(word))suggestions.set(word,Promise.resolve().then(()=>spell({action:'suggest',word,language})).catch(()=>({replacements:[]})));
  }
  await Promise.all(matches.map(async match=>{
    const pending=suggestions.get(text.slice(match.offset,match.offset+match.length));
    if(pending&&!match.replacements?.length)match.replacements=(await pending).replacements||[];
  }));
  return {matches:matches.sort((a,b)=>a.offset-b.offset),warnings};
}
