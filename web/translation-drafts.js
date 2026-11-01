import {validateLesson} from './learning-core.js';

export const TRANSLATION_PRACTICE_LIMIT = 20000;
const SNAPSHOT_LIMIT = 12000;

/** Keep lesson snapshots portable without splitting a UTF-16 surrogate pair. */
export function translationSnapshot(value, limit = SNAPSHOT_LIMIT) {
  if (typeof value !== 'string') throw Error('Texto da atividade de tradução inválido.');
  if (value.length <= limit) return value;
  let end = limit - 1;
  if (/[\uD800-\uDBFF]/u.test(value[end-1]) && /[\uDC00-\uDFFF]/u.test(value[end])) end--;
  return value.slice(0,end) + '…';
}

/** The identity includes full text, even when the portable snapshots are shortened. */
export async function translationPracticeLesson({target, pageId, pageTitle, blockId, original, translation}) {
  if (!['pt','en'].includes(target) || ![pageId,blockId].every(id=>typeof id==='string' && /^[A-Za-z0-9_-]{1,128}$/.test(id)) || typeof original!=='string' || typeof translation!=='string') throw Error('Origem da atividade de tradução inválida.');
  const content = new TextEncoder().encode(JSON.stringify([original,translation]));
  const digest = await crypto.subtle.digest('SHA-256',content);
  const hash = [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
  const shortened = original.length>SNAPSHOT_LIMIT || translation.length>SNAPSHOT_LIMIT;
  return validateLesson({id:`translation:${target}:${pageId}:${blockId}:${hash}`,kind:'writing',language:target,
    title:translationSnapshot(`Tradução · ${pageTitle || 'Prática de escrita'}`),
    before:translationSnapshot(original),after:translationSnapshot(translation),
    prompt:`Reescreva o trecho original em ${target==='pt'?'português':'inglês'} do seu jeito. Depois compare com a tradução de referência.`,
    explanation:'Esta é uma tradução automática possível, preservada quando você começou a atividade. Compare sentido, ordem das palavras, expressões e conectivos. Uma diferença não significa um erro.' + (shortened?' O original ou a referência eram longos; este cartão preserva os primeiros 12.000 caracteres de cada trecho, com reticências no corte. Sua tentativa é preservada integralmente até o limite de 20.000 caracteres.':''),
  });
}

/** A live field owns its text; a late disk response can only fill an untouched field. */
export function translationDraftSession(store, inputLesson) {
  const lesson = validateLesson(inputLesson), key = lesson.id;
  let value = store.current(key)?.data.text || '', edited = false, archived = false, written = null;
  const isArchived = () => {
    if(archived || !written)return archived;
    const current=store.current(key);
    if(current?.id===written.id && current.data.text===value)return false;
    if(written && store.archived.some(row=>row.id===written.id && row.data.text===value))archived=true;
    return archived;
  };
  const write = () => {
    // An explicit new edit after a restore starts a separate record, preserving
    // both the archived attempt and any draft that came from that backup.
    const row=store.set({key,lesson,tab:'writing',text:value,...(archived?{id:crypto.randomUUID()}:{})});
    written=row;archived=false;return row;
  };
  return {
    lesson,
    get text() { return value; },
    get archived() { return isArchived(); },
    current() { return isArchived() ? null : store.current(key); },
    capture(text, {input=false}={}) {
      if (typeof text!=='string' || text.length>TRANSLATION_PRACTICE_LIMIT) throw Error('A prática aceita até 20.000 caracteres.');
      isArchived();
      if (!input && text===value) return archived ? null : store.current(key);
      value=text;edited=true;return write();
    },
    refresh() {
      if(edited && isArchived())return value;
      // This also preserves an explicit clear typed before the initial GET.
      if (edited) write();
      else value=store.current(key)?.data.text || '';
      return value;
    },
  };
}
