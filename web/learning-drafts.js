import {validateLesson} from './learning-core.js';

export const DRAFT_CACHE = 'trama-learning-drafts-v1';
const copy = value => JSON.parse(JSON.stringify(value));

export function validateDraft(row) {
  const data = row?.data, lesson = validateLesson(data?.lesson);
  if (!data || !/^[A-Za-z0-9_-]{1,128}$/.test(data.id) || row.id !== data.id || !['words','writing','review'].includes(data.tab) || data.language !== lesson.language || data.key !== (data.tab === 'review' ? 'review:' : '') + lesson.id || typeof data.text !== 'string' || data.text.length > 12000 || !Number.isSafeInteger(row.revision) || row.revision < 0 || !Number.isFinite(Date.parse(row.updated))) throw Error('Rascunho inválido.');
  return {id: data.id, revision: row.revision, updated: row.updated, data: {id:data.id,key:data.key,tab:data.tab,language:data.language,lesson,text:data.text}, dirty: row.dirty === true};
}

/** Write-through browser cache plus optimistic, independently versioned disk records. */
export function createDraftStore({request, storage, uid = () => crypto.randomUUID(), onChange = () => {}, delay = 500, cacheKey = DRAFT_CACHE, initialCache} = {}) {
  const records = new Map(), selected = new Map();
  let epoch = null, connected = false, timer = null, busy = null, cacheOK = false, failure = '', archived = [];
  function emit() { onChange(status()); }
  function list() { return [...records.values()].sort((a,b)=>b.updated.localeCompare(a.updated)); }
  function cache() {
    try {
      // Pending text is never evicted to make room for older, already-saved text.
      const pending = list().filter(row=>row.dirty), clean = list().filter(row=>!row.dirty).slice(0,50);
      storage?.setItem(cacheKey, JSON.stringify({epoch,records:[...pending,...clean],archived}));
      cacheOK = !!storage;
    } catch { cacheOK = false; }
    emit();
  }
  try {
    const cached = initialCache || JSON.parse(storage?.getItem(cacheKey) || 'null');
    if (cached && (cached.epoch === null || typeof cached.epoch === 'string') && Array.isArray(cached.records)) {
      epoch = cached.epoch;
      for (const row of cached.records) { try { const valid = validateDraft(row); records.set(valid.id,valid); } catch {} }
      for(const row of Array.isArray(cached.archived)?cached.archived:[]){try{archived.push(validateDraft(row));}catch{}}
    }
  } catch { failure = 'Não foi possível recuperar a cópia do navegador.'; }
  async function connect() {
    const result = await request('/api/learning/drafts');
    if (typeof result.epoch !== 'string' || !Array.isArray(result.records)) throw Error('Resposta de rascunhos inválida.');
    const remote = result.records.map(validateDraft);
    if (epoch && result.epoch !== epoch) {
      // A restored database must not be silently overwritten by a browser cache.
      archived.push(...list().filter(row=>row.data.text)); records.clear(); selected.clear();
    }
    epoch = result.epoch;
    for (const row of remote) if (!records.get(row.id)?.dirty) records.set(row.id,row);
    connected = true; failure = ''; cache();
    if(list().some(row=>row.dirty))schedule();
  }
  const ready = connect().catch(error=>{ failure = error.message; emit(); return false; });
  function status() {
    const pending = [...records.values()].some(row=>row.dirty);
    return {pending, busy:!!busy, cacheOK, connected, error:failure,
      message: failure ? `Rascunho ${cacheOK?'preservado no navegador':'ainda sem confirmação'}. ${failure}` : pending ? (cacheOK?'Rascunho salvo no navegador; gravando no computador…':'Gravando rascunho; mantenha esta janela aberta…') : 'Rascunho salvo neste computador.'};
  }
  function current(key) {
    return records.get(selected.get(key)) || list().find(row=>row.data.key===key) || null;
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(()=>void flush(), delay); }
  function set({key,lesson,tab,text,id}) {
    const old = id ? records.get(id) : current(key);
    if (old && old.data.text===text) return old;
    if (!old && !text) return null;
    const ident = old?.id || uid();
    const row = validateDraft({id:ident,revision:old?.revision || 0,updated:new Date().toISOString(),dirty:true,
      data:{id:ident,key,lesson,tab,language:lesson.language,text}});
    records.set(ident,row); selected.set(key,ident); failure=''; cache(); schedule(); return row;
  }
  async function savePending() {
    await ready;
    try {
      if (!connected) await connect();
      for (let row of list().filter(item=>item.dirty)) {
        row = records.get(row.id); if (!row?.dirty) continue;
        const sent = copy(row);
        let saved;
        try { saved = await request('/api/learning/drafts',{epoch,revision:sent.revision,data:sent.data}); }
        catch (error) {
          if (error.code !== 'draft_conflict') throw error;
          // Fork on concurrent changes. Both windows' writing remains recoverable.
          const latest = records.get(row.id), ident = uid();
          const fork = {...latest,id:ident,revision:0,data:{...latest.data,id:ident},dirty:true};
          records.delete(row.id); records.set(ident,fork); selected.set(fork.data.key,ident); cache();
          saved = await request('/api/learning/drafts',{epoch,revision:0,data:fork.data});
          row=fork;
          const oldRemote = await request('/api/learning/drafts');
          for (const record of oldRemote.records.map(validateDraft)) if (!records.has(record.id)) records.set(record.id,record);
        }
        saved = validateDraft(saved);
        const latest = records.get(row.id);
        if (latest) {
          if (JSON.stringify(latest.data)===JSON.stringify(saved.data)) records.set(row.id,saved);
          else records.set(row.id,{...latest,revision:saved.revision,dirty:true});
        }
        failure=''; cache();
      }
      return !list().some(row=>row.dirty);
    } catch (error) { failure=error.message; if(error.code==='draft_epoch')connected=false; cache(); return false; }
  }
  async function flush() {
    clearTimeout(timer);
    while (busy) { await busy; if (!list().some(row=>row.dirty)) return true; }
    busy=savePending(); emit();
    try { return await busy; } finally { busy=null;if(!list().some(row=>row.dirty)){clearTimeout(timer);timer=null;}emit(); }
  }
  return {ready,list,current,set,flush,status,
    select(id) { const row=records.get(id); if(row)selected.set(row.data.key,id); return row; },
    get archived() { return copy(archived); },
    recoverArchived(index) { const row=archived[index]; if(!row)return null; const ident=uid(); const restored={...row,id:ident,revision:0,updated:new Date().toISOString(),dirty:true,data:{...row.data,id:ident}}; records.set(ident,restored); selected.set(restored.data.key,ident); archived.splice(index,1); cache();schedule();return restored; }
  };
}

export function browserDraftStore(onChange, environment=globalThis) {
  const newId=()=>environment.crypto.randomUUID();
  // sessionStorage is copied when a tab is duplicated. Give each document a
  // new writer, using the previous writer only as a recovery source.
  const writer=newId(), cacheKey=DRAFT_CACHE+':'+writer;
  let storage, previousWriter=null, initialCache=null;
  try { storage=environment.localStorage; } catch {}
  try {
    previousWriter=environment.sessionStorage.getItem('trama-learning-writer');
    environment.sessionStorage.setItem('trama-learning-writer',writer);
  } catch {}
  try {
    const candidates=Object.keys(storage||{}).filter(key=>key===DRAFT_CACHE||key.startsWith(DRAFT_CACHE+':')).map(key=>{
      try {const value=JSON.parse(storage.getItem(key));return value&&(value.epoch===null||typeof value.epoch==='string')&&Array.isArray(value.records)?{key,value}:null;}catch{return null;}
    }).filter(Boolean);
    const preferred=candidates.find(item=>item.key===DRAFT_CACHE+':'+previousWriter)
      ||candidates.sort((a,b)=>(b.value.records[0]?.updated||'').localeCompare(a.value.records[0]?.updated||''))[0];
    if(preferred) {
      const latest=preferred.value, known=new Set(), archived=[];
      for(const row of latest.records)known.add(JSON.stringify(row.data));
      const preserve=row=>{
        try {const valid=validateDraft(row),identity=JSON.stringify(valid.data);
          if(valid.data.text&&!known.has(identity)){archived.push(valid);known.add(identity);}
        }catch{}
      };
      for(const candidate of candidates) {
        for(const row of Array.isArray(candidate.value.archived)?candidate.value.archived:[])preserve(row);
        if(candidate!==preferred)for(const row of candidate.value.records)if(row?.dirty)preserve(row);
      }
      initialCache={...latest,archived};
      storage.setItem(cacheKey,JSON.stringify(initialCache));
    }
  } catch {}
  const store=createDraftStore({storage,cacheKey,initialCache,onChange,uid:newId,request:async(path,body)=>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
    try {
      const response=await environment.fetch(path,{...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{}),signal:controller.signal});
      const result=await response.json();
      if(!response.ok)throw Object.assign(Error(result.error||'Não foi possível gravar o rascunho.'),{code:result.code});
      return result;
    } catch(error) {
      if(error.name==='AbortError')throw Error('O servidor local demorou para responder. Tente salvar novamente.');
      throw error;
    } finally { clearTimeout(timer); }
  }});
  environment.addEventListener?.('pagehide',()=>{
    // Only this document's cache may be removed. Another live window may own
    // the recovery source, even when its sessionStorage was copied from ours.
    if(!store.status().connected||store.status().pending||store.archived.length)return;
    try {const cached=JSON.parse(storage?.getItem(cacheKey)||'null');
      if(cached&&Array.isArray(cached.records)&&cached.records.every(row=>row.dirty===false)
          &&Array.isArray(cached.archived)&&!cached.archived.length)storage.removeItem(cacheKey);
    }catch{}
  });
  return store;
}
