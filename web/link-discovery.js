/** Read-only discovery helpers. Suggestions never materialize pages or blocks. */
import {findPage, walkBlocks, extractRefs, rewriteBlockReferences} from './core.js';

const identity = value => value.normalize('NFC').toLocaleLowerCase('pt-BR');
const searchable = value => identity(value).normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');
const clean = value => typeof value === 'string' ? value.trim() : '';
const limitValue = value => Number.isSafeInteger(value) && value >= 0 ? value : 10;
const collator = new Intl.Collator('pt-BR', {numeric:true, sensitivity:'variant'});
const excerpt = (value, maximum) => {
  const text = String(value).replace(/\s+/gu, ' ').trim();
  if(text.length <= maximum)return text;
  let end = maximum - 1;
  if(/[\uD800-\uDBFF]/u.test(text[end-1]) && /[\uDC00-\uDFFF]/u.test(text[end]))end--;
  return text.slice(0,end) + '…';
};

function pageRank(title, query, foldedQuery) {
  const exact = identity(title.trim()), folded = searchable(title.trim());
  if(exact === identity(query))return 0;
  if(folded === foldedQuery)return 1;
  if(exact.startsWith(identity(query)))return 2;
  if(folded.startsWith(foldedQuery))return 3;
  if(exact.includes(identity(query)))return 4;
  if(folded.includes(foldedQuery))return 5;
  return -1;
}

/** Accent-insensitive search does NOT change the identity rules of core.findPage.
 * Creation occupies one of the requested result slots and is always last.
 * Values are plain strings; the UI must escape them when producing HTML.
 */
export function pageSuggestions(data, query, limit=10) {
  const title=clean(query), count=limitValue(limit);
  if(!count)return [];
  const folded=searchable(title);
  const found=data.pages.map((page,index)=>({page,index,rank:title?pageRank(page.title,title,folded):0}))
    .filter(row=>row.rank>=0)
    .sort((a,b)=>a.rank-b.rank || collator.compare(a.page.title,b.page.title) || a.index-b.index);
  // Core validates the trimmed value on acceptance; keep its title restrictions.
  // Control characters are also forbidden here because the stored schema rejects them.
  const create=title && title.length<=500 && !/[\r\n\u0000-\u001F\u007F]|\[\[|\]\]/u.test(title) && !findPage(data,title);
  const result=found.slice(0,Math.max(0,count-(create?1:0))).map(({page})=>({
    kind:'page',label:page.title,value:page.title,description:'Página existente',
  }));
  if(create)result.push({kind:'create',label:`Criar página “${title}”`,value:title,
    description:'A página só será criada ao aceitar esta opção.'});
  return result;
}

function queryText(value) {
  let query=clean(value);
  if(query.startsWith('(('))query=query.slice(2);
  if(query.endsWith('))'))query=query.slice(0,-2);
  return query.trim();
}

/** Live-reference preview, bounded against cycles and exponential expansions.
 * Source block text is searched in full; expanded reference context is bounded.
 */
function liveText(block, byId, seen=new Set(), depth=0, budget={remaining:8000}) {
  if(seen.has(block.id)||depth>=8||budget.remaining<=0)return '';
  const path=new Set(seen);path.add(block.id);
  let raw=block.text.slice(0,budget.remaining);
  if(/[\uD800-\uDBFF]$/u.test(raw))raw=raw.slice(0,-1);
  budget.remaining-=raw.length;
  return rewriteBlockReferences(raw,(id,whole)=>{
    const target=byId.get(id)?.block;
    if(!target||path.has(id)||depth>=7||budget.remaining<=0)return whole;
    return liveText(target,byId,path,depth+1,budget)||whole;
  });
}

/** Search ID, prose, page title and ancestors. No graph mutation or DOM access.
 * label contains a short live preview and breadcrumb; value is the stable UID.
 */
export function blockSuggestions(data, query, {excludeId,limit=10}={}) {
  const count=limitValue(limit);
  if(!count)return [];
  const entries=walkBlocks(data.pages), byId=new Map(entries.map(entry=>[entry.block.id,entry]));
  const rawQuery=queryText(query), folded=searchable(rawQuery);
  const terms=searchable(rawQuery.replace(/\[\[([^\]]+)\]\]/gu,'$1')).split(/\s+/u).filter(Boolean);
  const pageSearch=new Map(data.pages.map(page=>[page.id,searchable(page.title)]));
  const found=[];
  for(let index=0;index<entries.length;index++) {
    const entry=entries[index],{block,page}=entry;
    if(block.id===excludeId)continue;
    const live=block.text.includes('((')?liveText(block,byId):block.text;
    const own=searchable(block.text), expanded=searchable(live), id=identity(block.id);
    let rank=0;
    if(folded) {
      if(block.id===rawQuery)rank=-2;
      else if(id===identity(rawQuery))rank=-1;
      else if(id.startsWith(identity(rawQuery)))rank=0;
      else if(own===folded||expanded===folded)rank=1;
      else if(own.startsWith(folded)||expanded.startsWith(folded))rank=2;
      else if(own.includes(folded)||expanded.includes(folded))rank=3;
      else if(id.includes(identity(rawQuery)))rank=3;
      else if(terms.every(term=>own.includes(term)||expanded.includes(term)))rank=4;
      else {
        let missing=terms.filter(term=>!own.includes(term)&&!expanded.includes(term)&&!pageSearch.get(page.id).includes(term));
        let parent=entry.parent;
        while(missing.length&&parent) {
          const context=searchable(parent.text);
          missing=missing.filter(term=>!context.includes(term));
          parent=byId.get(parent.id)?.parent;
        }
        if(missing.length)continue;
        rank=5;
      }
    } else rank=block.text.trim()?0:1;
    found.push({entry,index,rank,live});
  }
  found.sort((a,b)=>a.rank-b.rank || Number(!a.live.trim())-Number(!b.live.trim())
    || (a.rank>0?a.live.length-b.live.length:0) || a.index-b.index);
  return found.slice(0,count).map(({entry,live})=>{
    const ancestors=[];let parent=entry.parent;
    while(parent){ancestors.push(excerpt(parent.text,72)||'(bloco vazio)');parent=byId.get(parent.id)?.parent;}
    ancestors.reverse();
    const trail=ancestors.length>3?['…',...ancestors.slice(-3)]:ancestors;
    const description=[entry.page.title,...trail].join(' › ');
    return {kind:'block',value:entry.block.id,text:excerpt(live,180)||'(bloco vazio)',label:`${excerpt(live,180)||'(bloco vazio)'} · ${description}`,description};
  });
}

/** Counts distinct source blocks, not repeated tokens in one source block.
 * Missing destinations are omitted; active self-references count once.
 */
export function incomingBlockCounts(data) {
  const entries=walkBlocks(data.pages), valid=new Set(entries.map(entry=>entry.block.id)), counts=new Map();
  for(const {block} of entries)for(const id of extractRefs(block.text)) {
    if(valid.has(id))counts.set(id,(counts.get(id)||0)+1);
  }
  return counts;
}
