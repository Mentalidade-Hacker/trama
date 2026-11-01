import {applySuggestion} from './proofread.js';

const parts = {
  substantivo:'Nomeia pessoas, coisas, lugares, sentimentos ou ideias.',
  noun:'Nomeia pessoas, coisas, lugares, sentimentos ou ideias.',
  verbo:'Expressa uma ação, um estado ou um acontecimento.',
  verb:'Expressa uma ação, um estado ou um acontecimento.',
  adjetivo:'Atribui uma característica a um substantivo.',
  adjective:'Atribui uma característica a um substantivo.',
  advérbio:'Modifica um verbo, um adjetivo, outro advérbio ou a frase.',
  adverb:'Modifica um verbo, um adjetivo, outro advérbio ou a frase.',
  pronome:'Pode substituir ou acompanhar um nome, indicando participantes e relações.',
  pronoun:'Pode substituir ou acompanhar um nome, indicando participantes e relações.',
  preposição:'Liga termos e expressa relações como lugar, tempo ou finalidade.',
  preposition:'Liga termos e expressa relações como lugar, tempo ou finalidade.',
  conjunção:'Conecta termos ou orações; pode indicar contraste, causa ou conclusão.',
  conjunction:'Conecta termos ou orações; pode indicar contraste, causa ou conclusão.',
  artigo:'Acompanha um substantivo e ajuda a identificar seu referente.',
  article:'Acompanha um substantivo e ajuda a identificar seu referente.',
  expressão:'Grupo de palavras usado em conjunto para transmitir um sentido.',
  phrase:'Grupo de palavras usado em conjunto para transmitir um sentido.'
};
export const partOfSpeechHelp = value => {
  const label=String(value||'').normalize('NFC').toLocaleLowerCase().trim();
  return parts[label] || parts[label.split(/\s+/u)[0]] || '';
};

// A real correction and its context become a study card only at the user's request.
export function correctionForStudy(text, match, language) {
  const replacement = match?.replacements?.[0]?.value;
  if (typeof replacement !== 'string') throw Error('Escolha um alerta com uma sugestão para praticar a correção.');
  const after = applySuggestion(text, match, replacement, text);
  const beforeMatch = text.slice(0, match.offset);
  const boundaries = [...beforeMatch.matchAll(/[.!?](?=\s)|\n/gu)];
  const sentenceStart = boundaries.length ? boundaries.at(-1).index + 1 : 0;
  const trailing = /[.!?](?=\s|$)|\n/u.exec(text.slice(match.offset + match.length));
  const sentenceEnd = trailing ? match.offset + match.length + trailing.index + 1 : text.length;
  let start = Math.max(sentenceStart, match.offset - 500);
  while (start < match.offset && /\s/u.test(text[start])) start++;
  let end = Math.min(sentenceEnd, match.offset + match.length + 500);
  const splits = index => index > 0 && index < text.length && text.charCodeAt(index - 1) >= 0xD800 && text.charCodeAt(index - 1) <= 0xDBFF && text.charCodeAt(index) >= 0xDC00 && text.charCodeAt(index) <= 0xDFFF;
  if (splits(start)) start--;
  if (splits(end)) end++;
  const spelling = match.rule?.issueType === 'misspelling';
  return {
    language: language.startsWith('en') ? 'en' : 'pt',
    word: spelling && /^[\p{L}\p{M}]+(?:['’\-][\p{L}\p{M}]+)*$/u.test(replacement) ? replacement : '',
    correction: {
      before: (start > sentenceStart && !/^\s*$/u.test(text.slice(sentenceStart,start)) ? '…' : '') + text.slice(start, end) + (end < sentenceEnd ? '…' : ''),
      after: (start > sentenceStart && !/^\s*$/u.test(text.slice(sentenceStart,start)) ? '…' : '') + after.slice(start, end + replacement.length - match.length) + (end < sentenceEnd ? '…' : ''),
      explanation: spelling
        ? `O dicionário ortográfico não reconheceu “${text.slice(match.offset, match.offset + match.length)}”. Uma sugestão é “${replacement}”. Confira se ela expressa o sentido que você quer; nomes próprios e termos especializados podem precisar ser aceitos.`
        : String(match.message || 'Compare a sugestão no contexto da frase.'),
      kind: spelling ? 'spelling' : 'grammar'
    }
  };
}
