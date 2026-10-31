import * as C from './core.js';

export const LEARNING_PAGE = 'Aprender · Português e English';
export const REVIEW_DAYS = [1, 3, 7, 14, 30, 60];
const PREFIX = '```trama-learning-v1\n';
const ATTEMPT_PREFIX = '```trama-learning-attempt-v1\n';
const DAY = 86400000;
const languages = ['pt', 'en'];
const kinds = ['word', 'writing', 'dictionary', 'correction'];
const iso = value => { const date = new Date(value ?? Date.now()); if (!Number.isFinite(date.getTime())) throw Error('Data de estudo inválida.'); return date.toISOString(); };
const text = (value, limit = 12000) => { if (typeof value !== 'string' || value.length > limit) throw Error('Texto de estudo inválido ou longo demais.'); return value; };
const plain = value => String(value ?? '').replace(/\[\[/g, '［［').replace(/\]\]/g, '］］').replace(/\{\{/g, '｛｛').replace(/\}\}/g, '｝｝').replace(/\(\(/g, '（（').replace(/\)\)/g, '））').replace(/#/g, '＃').replace(/::/g, '：').replace(/`/g, 'ˋ');
const title = lesson => lesson.word || lesson.title || 'Prática de escrita';
const safeURL = value => { try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; } };

/** Only whitelisted data goes into portable block text; no custom graph fields. */
export function validateLesson(input) {
  if (!input || typeof input !== 'object' || !languages.includes(input.language) || !kinds.includes(input.kind)) throw Error('Lição ou idioma inválido.');
  if (typeof input.id !== 'string' || !input.id || input.id.length > 600) throw Error('Identificador de lição inválido.');
  const lesson = {id: input.id, language: input.language, kind: input.kind};
  for (const key of ['word', 'title', 'partOfSpeech', 'meaning', 'usage', 'before', 'after', 'explanation', 'prompt']) {
    if (input[key] !== undefined) lesson[key] = text(input[key]);
  }
  if (!title(lesson).trim() || !lesson.prompt?.trim()) throw Error('A lição precisa de um título e uma proposta de escrita.');
  lesson.examples = (input.examples || []).slice(0, 8).map(example => ({text: text(example.text), translation: text(example.translation || '')}));
  lesson.alternatives = (input.alternatives || []).slice(0, 8).map(item => ({word: text(item.word, 300), note: text(item.note)}));
  if (input.quiz) {
    const quiz = input.quiz;
    if (!Array.isArray(quiz.options) || quiz.options.length !== 4 || !Number.isInteger(quiz.answer) || quiz.answer < 0 || quiz.answer > 3) throw Error('Exercício de escolha inválido.');
    lesson.quiz = {sentence: text(quiz.sentence), options: quiz.options.map(option => text(option, 1000)), answer: quiz.answer, explanation: text(quiz.explanation)};
  }
  if (input.source && typeof input.source === 'object') lesson.source = {name: text(input.source.name || '', 500), url: safeURL(input.source.url), license: text(input.source.license || '', 100), licenseUrl: safeURL(input.source.licenseUrl)};
  return lesson;
}

function encode(state, prefix = PREFIX) {
  // Escape graph delimiters only inside JSON strings. This keeps the JSON
  // inspectable and avoids materializing links/commands from quoted examples.
  const json = JSON.stringify(state).replace(/"(?:\\.|[^"\\])*"/g, token => token.replace(/[\[\]{}()#`<:]/g, char => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0')));
  return prefix + json + '\n```';
}

/** Retrieve the exact typed text, including literal graph syntax, from a saved attempt. */
export function readPracticeAttempt(block) {
  const child = block?.children?.find(item => item.text.startsWith(ATTEMPT_PREFIX) && item.text.endsWith('\n```'));
  if (!child) return null;
  try {
    const record = JSON.parse(child.text.slice(ATTEMPT_PREFIX.length, -4));
    if (record.version !== 1 || typeof record.text !== 'string' || record.text.length > 12000 || !record.createdAt) return null;
    return {text: record.text, createdAt: iso(record.createdAt)};
  } catch { return null; }
}

function decode(block) {
  const child = block.children.find(item => item.text.startsWith(PREFIX) && item.text.endsWith('\n```'));
  if (!child) return null;
  try {
    const state = JSON.parse(child.text.slice(PREFIX.length, -4));
    if (state.version !== 1) return null;
    state.lesson = validateLesson(state.lesson);
    if (!Array.isArray(state.operations) || state.operations.some(id => typeof id !== 'string') || !Number.isInteger(state.attempts) || state.attempts < 0 || !Number.isInteger(state.quizAttempts) || state.quizAttempts < 0 || !Number.isInteger(state.repetitions) || state.repetitions < 0) return null;
    for (const key of ['createdAt', 'lastSeenAt']) { if (state[key] === undefined || state[key] === null) return null; state[key] = iso(state[key]); }
    if (state.dueAt !== null) { if (state.dueAt === undefined) return null; state.dueAt = iso(state.dueAt); }
    return {state, metadata: child};
  } catch { return null; }
}

export function readLearning(data) {
  const page = C.findPage(data, LEARNING_PAGE), cards = new Map();
  if (page) for (const block of page.blocks) {
    const parsed = decode(block);
    if (!parsed) continue;
    const card = {page, block, ...parsed};
    // If a user duplicates a card, retain the most recent record for its lesson.
    const previous = cards.get(parsed.state.lesson.id);
    if (!previous || parsed.state.lastSeenAt > previous.state.lastSeenAt) cards.set(parsed.state.lesson.id, card);
  }
  return {page, cards};
}

export function learningStats(data, language, now = new Date()) {
  const time = new Date(iso(now)).getTime();
  const cards = [...readLearning(data).cards.values()].filter(card => !language || card.state.lesson.language === language);
  return {seen: cards.length, practiced: cards.filter(card => card.state.attempts > 0).length,
    attempts: cards.reduce((sum, card) => sum + card.state.attempts, 0),
    due: cards.filter(card => card.state.dueAt && new Date(card.state.dueAt).getTime() <= time).length};
}

export function dueReviews(data, language, now = new Date()) {
  const time = new Date(iso(now)).getTime();
  return [...readLearning(data).cards.values()].filter(card => card.state.lesson.language === language && card.state.dueAt && new Date(card.state.dueAt).getTime() <= time)
    .sort((a, b) => a.state.dueAt.localeCompare(b.state.dueAt));
}

/** Rotate unseen lessons first, then the least recently encountered lesson. */
export function nextLesson(lessons, data, language, currentId = null) {
  const cards = readLearning(data).cards;
  let choices = lessons.filter(lesson => lesson.language === language);
  if (choices.length > 1) choices = choices.filter(lesson => lesson.id !== currentId);
  return choices.map((lesson, index) => ({lesson, index, state: cards.get(lesson.id)?.state})).sort((a, b) => {
    if (!!a.state !== !!b.state) return a.state ? 1 : -1;
    if (a.state && b.state) return a.state.lastSeenAt.localeCompare(b.state.lastSeenAt) || a.index - b.index;
    return a.index - b.index;
  })[0]?.lesson || null;
}

function addToPage(page, block) {
  if (page.blocks.length === 1 && !page.blocks[0].text && !page.blocks[0].children.length) page.blocks = [block];
  else page.blocks.push(block);
}

function putSummary(card) {
  const state = card.state;
  const summary = `Progresso: ${state.attempts} ${state.attempts === 1 ? 'texto próprio salvo' : 'textos próprios salvos'} · ${state.quizAttempts} escolhas respondidas · ${state.repetitions} revisões lembradas em sequência`;
  const next = state.dueAt ? `Próxima revisão: ${new Date(state.dueAt).toLocaleString('pt-BR')}` : 'Próxima revisão: escreva sua frase ou guarde este cartão para começar';
  for (const [prefix, value] of [['Progresso:', summary], ['Próxima revisão:', next]]) {
    const child = card.block.children.find(item => item.text.startsWith(prefix));
    if (child) child.text = value; else card.block.children.unshift(C.newBlock(value));
  }
  card.metadata.text = encode(state);
  card.page.updated = state.lastSeenAt;
}

function upsert(data, input, now) {
  const lesson = validateLesson(input), existing = readLearning(data).cards.get(lesson.id);
  if (existing) return existing;
  const page = C.ensurePage(data, LEARNING_PAGE), block = C.newBlock(`${plain(title(lesson))} #trama/aprender`);
  block.collapsed = true;
  block.children = [C.newBlock(`Idioma: ${lesson.language === 'pt' ? 'Português' : 'English'} · ${lesson.kind === 'word' || lesson.kind === 'dictionary' ? 'Palavra em uso' : 'Prática de escrita'}`)];
  for (const [key, label] of [['meaning', 'Significado'], ['before', 'Antes'], ['after', 'Uma versão possível'], ['explanation', 'Explicação'], ['usage', 'Como usar'], ['prompt', 'Proposta']]) if (lesson[key]) block.children.push(C.newBlock(`${label}: ${plain(lesson[key])}`));
  for (const example of lesson.examples) {
    const item = C.newBlock(`Exemplo: ${plain(example.text)}`);
    if (example.translation) item.children.push(C.newBlock(`Tradução: ${plain(example.translation)}`));
    block.children.push(item);
  }
  if (lesson.source?.url) block.children.push(C.newBlock(`Fonte: [${plain(lesson.source.name)}](${lesson.source.url})${lesson.source.licenseUrl ? ` · [${plain(lesson.source.license)}](${lesson.source.licenseUrl})` : ''}`));
  const state = {version: 1, lesson, createdAt: now, lastSeenAt: now, attempts: 0, quizAttempts: 0, repetitions: 0, intervalDays: 0, dueAt: null, operations: []};
  const metadata = C.newBlock(encode(state));
  block.children.push(metadata); addToPage(page, block);
  return {page, block, state, metadata};
}

function operation(data, lesson, options, change) {
  const now = iso(options.now), operationId = options.operationId || C.uid();
  text(operationId, 200);
  const card = upsert(data, lesson, now);
  if (card.state.operations.includes(operationId)) return {...card, duplicate: true};
  change(card, now);
  card.state.lastSeenAt = now;
  card.state.operations.push(operationId); card.state.operations = card.state.operations.slice(-200);
  putSummary(card);
  return card;
}

export function markLessonSeen(data, lesson, options = {}) {
  return operation(data, lesson, options, () => {});
}

export function answerQuiz(data, input, choice, options = {}) {
  const lesson = validateLesson(input);
  if (!lesson.quiz || !Number.isInteger(choice) || choice < 0 || choice >= lesson.quiz.options.length) throw Error('Escolha uma das quatro respostas.');
  const correct = choice === lesson.quiz.answer;
  const card = operation(data, lesson, options, (card, now) => {
    card.state.quizAttempts++;
    const block = C.newBlock(`Escolha respondida · ${new Date(now).toLocaleString('pt-BR')} · ${correct ? 'resposta prevista' : 'comparar escolhas'}`);
    block.children = [C.newBlock(`Frase: ${plain(lesson.quiz.sentence)}`), C.newBlock(`Minha escolha: ${plain(lesson.quiz.options[choice])}`), C.newBlock(`Resposta prevista: ${plain(lesson.quiz.options[lesson.quiz.answer])}`), C.newBlock(`Por quê: ${plain(lesson.quiz.explanation)}`)];
    card.block.children.push(block);
  });
  return {...card, correct, explanation: lesson.quiz.explanation};
}

export function savePractice(data, lesson, sentence, options = {}) {
  sentence = text(sentence);
  if (!sentence.trim()) throw Error('Escreva uma frase ou um pequeno parágrafo antes de guardar.');
  return operation(data, lesson, options, (card, now) => {
    card.state.attempts++;
    if (!card.state.dueAt) { card.state.dueAt = new Date(new Date(now).getTime() + DAY).toISOString(); card.state.intervalDays = 1; }
    const block = C.newBlock(`Minha escrita · ${new Date(now).toLocaleString('pt-BR')}`);
    block.children = [C.newBlock(plain(sentence)), C.newBlock(encode({version:1,text:sentence,createdAt:now}, ATTEMPT_PREFIX))];
    card.block.children.push(block);
  });
}

export function saveReviewCard(data, lesson, options = {}) {
  return operation(data, lesson, options, (card, now) => { if (!card.state.dueAt) card.state.dueAt = now; });
}

export function scheduleReview(previous, rating, now = new Date()) {
  if (!['again', 'remembered'].includes(rating)) throw Error('Autoavaliação inválida.');
  const time = new Date(iso(now)).getTime();
  if (rating === 'again') return {repetitions: 0, intervalDays: 0, dueAt: new Date(time + 10 * 60000).toISOString()};
  const repetitions = Math.max(0, Number.isInteger(previous.repetitions) ? previous.repetitions : 0) + 1;
  const intervalDays = REVIEW_DAYS[Math.min(repetitions - 1, REVIEW_DAYS.length - 1)];
  return {repetitions, intervalDays, dueAt: new Date(time + intervalDays * DAY).toISOString()};
}

export function recordReview(data, lessonId, rating, options = {}) {
  if (options.revealed !== true) throw Error('Revele a referência antes de avaliar sua lembrança.');
  const card = readLearning(data).cards.get(lessonId);
  if (!card) throw Error('Este cartão não está mais no grafo. Reabra a revisão.');
  const schedule = scheduleReview(card.state, rating, options.now);
  return operation(data, card.state.lesson, options, (current, now) => {
    Object.assign(current.state, schedule);
    current.block.children.push(C.newBlock(`Revisão · ${new Date(now).toLocaleString('pt-BR')} · ${rating === 'again' ? 'quero praticar de novo' : 'lembrei'} · próxima: ${new Date(schedule.dueAt).toLocaleString('pt-BR')}`));
  });
}

export function dictionaryLesson(word, language, result) {
  const entry = result?.entries?.[0], sense = entry?.definitions?.[0];
  return validateLesson({id: `dictionary:${language}:${word.trim().normalize('NFC').toLocaleLowerCase()}`, kind: 'dictionary', language,
    word, partOfSpeech: entry?.partOfSpeech || '', meaning: sense?.definition || '',
    examples: (sense?.examples || []).slice(0, 2).map(example => ({text: example.text, translation: example.translation || ''})),
    source: entry?.source, prompt: `Escreva uma frase sua com “${word}”. Escolha uma situação concreta da sua vida.`,
    usage: sense ? 'Considere o sentido encontrado na fonte. Os exemplos abaixo aparecem apenas quando foram fornecidos pelo dicionário.' : 'Esta palavra não tem uma definição disponível nesta consulta. Escreva uma hipótese ou anotação pessoal; ela não será apresentada como definição do dicionário.'});
}

/** A failed disk save remains pending; retry flushes the same mutation once. */
export function createLearningWriter(ctx) {
  let pending = null, pendingSnapshot = null, busy = false;
  function checkPending() {
    const current = pending && C.findBlock(ctx.data, pending.block.id);
    if (!current || JSON.stringify(current.block) !== pendingSnapshot) {
      pending = null; pendingSnapshot = null;
      throw Error('O registro mudou ou saiu do grafo. O salvamento pendente foi cancelado; seu rascunho continua disponível para guardar novamente.');
    }
  }
  async function flushPending() {
    if (!pending) return null;
    checkPending();
    if (!await ctx.flush()) throw Error('Seu registro está na memória, mas ainda não foi salvo. Resolva o aviso de salvamento e tente novamente.');
    checkPending();
    const result = pending; pending = null; pendingSnapshot = null; return result;
  }
  return {
    get busy() { return busy; }, get pending() { return pending; },
    async commit(mutate) {
      if (busy || pending) throw Error('Conclua o salvamento pendente antes de outra atividade.');
      busy = true;
      try {
        if (!await ctx.flush()) throw Error('Há alterações pendentes ou um conflito no grafo. Resolva o aviso de salvamento antes de guardar a prática.');
        ctx.checkpoint(); pending = mutate(ctx.data); pendingSnapshot = JSON.stringify(pending.block); ctx.changed(pending.page.id); ctx.render();
        return await flushPending();
      } finally { busy = false; }
    },
    async retry() { if (busy) return null; busy = true; try { return await flushPending(); } finally { busy = false; } },
  };
}
