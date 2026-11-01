import test from 'node:test';
import assert from 'node:assert/strict';
import { validateQuizStructure } from './quiz.js';

function quiz(question = { question: '2 + 2?', options: ['3', '4'], answer: '4' }, partTitle = 'Multiple Choice') {
  return { title: 'Practice quiz', parts: [{ partTitle, questions: [question] }] };
}

test('accepts multiple choice, true/false fallback, and enumeration without changing the payload', () => {
  for (const payload of [
    quiz(),
    quiz({ question: 'The Earth is round.', answer: 'True' }, 'True or False'),
    quiz({ question: 'The Earth is round.', options: ['True', 'False'], answer: 'True' }, 'True or False'),
    quiz({ question: 'Name a planet.', answer: 'Earth' }, 'Enumeration'),
  ]) {
    assert.equal(validateQuizStructure(payload), payload);
  }
});

test('rejects unsafe options before they can reach React or answer handling', () => {
  for (const options of [[{}], [null], ['4', {}], [4], [], null, {}, '4', undefined, new Array(1)]) {
    assert.throws(() => validateQuizStructure(quiz({ question: '2 + 2?', answer: '4', options })), /Invalid quiz structure: .*options/);
  }
});

test('rejects missing or null nested data with a useful validation error', () => {
  for (const payload of [
    null, [], {}, { ...quiz(), title: {} },
    { ...quiz(), parts: null }, { ...quiz(), parts: [] },
    { ...quiz(), parts: [null] }, { ...quiz(), parts: [{}] },
    { ...quiz(), parts: [{ partTitle: 'Part', questions: null }] },
    { ...quiz(), parts: [{ partTitle: 'Part', questions: [] }] },
    quiz(null), quiz({}), quiz({ question: {}, answer: '4' }),
    quiz({ question: '2 + 2?', answer: null }),
  ]) {
    assert.throws(() => validateQuizStructure(payload), /Invalid quiz structure:/);
  }
});

test('validates every part and question instead of only the first', () => {
  const payload = quiz();
  payload.parts.push({ partTitle: 'Enumeration', questions: [{ question: 'Name a planet.', answer: 'Earth' }, null] });
  assert.throws(() => validateQuizStructure(payload), /parts\[1\]\.questions\[1\]/);
});

test('rejects model output with excessive counts or text before rendering', () => {
  const question = { question: 'Question?', answer: 'Answer' };
  for (const payload of [
    { ...quiz(), title: 'x'.repeat(1001) },
    { ...quiz(), parts: Array.from({ length: 4 }, () => ({ partTitle: 'Part', questions: [question] })) },
    { ...quiz(), parts: [{ partTitle: 'Part', questions: Array(51).fill(question) }] },
    { ...quiz(), parts: [25, 26].map(count => ({ partTitle: 'Part', questions: Array(count).fill(question) })) },
    quiz({ question: 'x'.repeat(4001), answer: 'Answer' }),
    quiz({ question: 'Question?', answer: 'x'.repeat(1001) }),
    quiz({ ...question, options: Array(11).fill('Option') }),
    quiz({ ...question, options: ['x'.repeat(1001)] }),
  ]) assert.throws(() => validateQuizStructure(payload), /Invalid quiz structure:/);
});
