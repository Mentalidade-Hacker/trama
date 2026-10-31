import test from 'node:test';
import assert from 'node:assert/strict';
import {WORD_LESSONS, WRITING_LESSONS} from '../web/learning-content.js';

function meaningful(value, label) {
  assert.equal(typeof value, 'string', label);
  assert.ok(value.trim().length > 0, `${label} is empty`);
  assert.equal(value, value.trim(), `${label} has accidental boundary whitespace`);
  assert.ok(!value.includes('\uFFFD'), `${label} contains damaged Unicode`);
  assert.ok(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(value), `${label} contains control characters`);
}

function quiz(lesson) {
  meaningful(lesson.quiz.sentence, `${lesson.id}: quiz sentence`);
  meaningful(lesson.quiz.explanation, `${lesson.id}: quiz explanation`);
  assert.equal(lesson.quiz.options.length, 4, `${lesson.id}: four options`);
  for (const option of lesson.quiz.options) meaningful(option, `${lesson.id}: option`);
  assert.equal(new Set(lesson.quiz.options.map(option => option.normalize('NFC').toLowerCase())).size, 4, `${lesson.id}: distinct options`);
  assert.ok(Number.isInteger(lesson.quiz.answer) && lesson.quiz.answer >= 0 && lesson.quiz.answer < 4, `${lesson.id}: answer index`);
}

test('curriculum contains exactly 30 paired concepts and six writing lessons per language', () => {
  assert.equal(WORD_LESSONS.length, 60);
  assert.equal(WRITING_LESSONS.length, 12);
  for (const language of ['pt', 'en']) {
    assert.equal(WORD_LESSONS.filter(lesson => lesson.language === language).length, 30);
    assert.equal(WRITING_LESSONS.filter(lesson => lesson.language === language).length, 6);
  }
  const all = [...WORD_LESSONS, ...WRITING_LESSONS];
  assert.equal(new Set(all.map(lesson => lesson.id)).size, all.length);
  for (const lesson of all) assert.match(lesson.id, new RegExp(`^${lesson.language}-[a-z0-9-]+$`));
});

test('each vocabulary record has two authored examples, contextual alternatives and a usable quiz', () => {
  for (const lesson of WORD_LESSONS) {
    for (const key of ['word', 'partOfSpeech', 'meaning', 'usage', 'prompt']) meaningful(lesson[key], `${lesson.id}: ${key}`);
    assert.equal(lesson.examples.length, 2, lesson.id);
    assert.equal(new Set(lesson.examples.map(example => example.text)).size, 2, `${lesson.id}: distinct examples`);
    for (const example of lesson.examples) {
      meaningful(example.text, `${lesson.id}: example`);
      meaningful(example.translation, `${lesson.id}: translation`);
      assert.notEqual(example.text, example.translation, `${lesson.id}: bilingual example`);
    }
    assert.ok(lesson.examples.some(example => example.text.toLowerCase().includes(lesson.word.toLowerCase())), `${lesson.id}: word used in context`);
    assert.equal(lesson.alternatives.length, 2, `${lesson.id}: alternatives`);
    assert.equal(new Set(lesson.alternatives.map(alternative => alternative.word)).size, 2);
    for (const alternative of lesson.alternatives) {
      meaningful(alternative.word, `${lesson.id}: alternative`);
      meaningful(alternative.note, `${lesson.id}: alternative distinction`);
      assert.notEqual(alternative.word, lesson.word);
    }
    quiz(lesson);
    assert.equal(lesson.quiz.options[lesson.quiz.answer], lesson.word, `${lesson.id}: vocabulary answer`);
    assert.equal(lesson.quiz.sentence.split('___').length, 2, `${lesson.id}: one vocabulary blank`);
  }
});

test('paired lessons preserve both directions of each example translation', () => {
  for (let index = 0; index < WORD_LESSONS.length; index += 2) {
    const pt = WORD_LESSONS[index], en = WORD_LESSONS[index + 1];
    assert.equal(pt.language, 'pt');
    assert.equal(en.language, 'en');
    for (let example = 0; example < 2; example++) {
      assert.equal(pt.examples[example].text, en.examples[example].translation);
      assert.equal(pt.examples[example].translation, en.examples[example].text);
    }
  }
});

test('writing lessons provide complete revisions and distinct practice questions', () => {
  for (const lesson of WRITING_LESSONS) {
    for (const key of ['title', 'before', 'after', 'explanation', 'prompt']) meaningful(lesson[key], `${lesson.id}: ${key}`);
    assert.notEqual(lesson.before, lesson.after, `${lesson.id}: actual revision`);
    quiz(lesson);
  }
  assert.equal(new Set(WRITING_LESSONS.map(lesson => lesson.quiz.sentence)).size, 12);
  assert.ok(WRITING_LESSONS.find(lesson => lesson.id === 'pt-writing-crase').after.includes('à coordenadora'));
  assert.ok(WRITING_LESSONS.find(lesson => lesson.id === 'en-writing-its').after.includes('its name'));
});

test('correct answers use every position in both languages and both lesson types', () => {
  for (const collection of [WORD_LESSONS, WRITING_LESSONS]) {
    for (const language of ['pt', 'en']) {
      assert.deepEqual([...new Set(collection.filter(lesson => lesson.language === language).map(lesson => lesson.quiz.answer))].sort(), [0, 1, 2, 3]);
    }
  }
});
