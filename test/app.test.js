import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createApp } from '../server/app.js';
const authHeaders = { Authorization: 'Bearer test-user-a-token' };
const jsonHeaders = { ...authHeaders, 'Content-Type': 'application/json' };

async function fixture(t, options = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'share-api-'));
  const config = { dataDir: path.join(directory, 'data'), uploadsDir: path.join(directory, 'uploads'), tempDir: path.join(directory, 'temp'),
    verifyAccessToken: async token => token === 'test-user-a-token' ? { id: 'user-a', user_metadata: { display_name: 'Student' } } : null, ...options };
  const server = createApp(config).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  return { base: `http://127.0.0.1:${server.address().port}`, config };
}

test('resource uploads persist, can be filtered/downloaded, and are removed on deletion', async t => {
  const { base, config } = await fixture(t);
  assert.deepEqual((await (await fetch(`${base}/api/posts`)).json()).posts, []);
  const body = new FormData();
  body.set('title', 'Bubble sort notes');
  body.set('description', 'Sorting and complexity');
  body.set('author', 'Student');
  body.set('subject', 'DSA');
  body.set('file', new Blob(['Study notes'], { type: 'text/plain' }), 'notes.txt');
  const response = await fetch(`${base}/api/posts`, { method: 'POST', headers: authHeaders, body });
  assert.equal(response.status, 201);
  const { post } = await response.json();
  assert.equal(post.file.originalname, 'notes.txt');
  assert.equal(await (await fetch(`${base}${post.file.url}`)).text(), 'Study notes');
  assert.equal((await (await fetch(`${base}/api/posts?q=complexity&subject=dsa`)).json()).count, 1);
  assert.equal((await (await fetch(`${base}/api/posts?subject=OOP`)).json()).count, 0);
  assert.equal((await (await fetch(`${base}/api/posts/${post.id}`)).json()).post.id, post.id);
  assert.equal(JSON.parse(await readFile(path.join(config.dataDir, 'posts.json'), 'utf8'))[0].id, post.id);
  // A fresh app instance reads the same saved collection.
  const second = createApp(config).listen(0, '127.0.0.1');
  await once(second, 'listening');
  try { assert.equal((await (await fetch(`http://127.0.0.1:${second.address().port}/api/posts`)).json()).count, 1); }
  finally { await new Promise(resolve => second.close(resolve)); }
  assert.equal((await fetch(`${base}/api/posts/${post.id}`, { method: 'DELETE', headers: authHeaders })).status, 200);
  assert.equal((await fetch(`${base}/api/posts/${post.id}`)).status, 404);
  assert.equal((await fetch(`${base}${post.file.url}`)).status, 404);
});

test('core starts without an AI key and returns actionable AI errors', async t => {
  const { base } = await fixture(t);
  assert.equal((await (await fetch(`${base}/api/health`)).json()).aiConfigured, false);
  for (const endpoint of ['/api/chat', '/api/quiz/generate', '/api/quiz/generate-from-file']) {
    const response = await fetch(`${base}${endpoint}`, { method: 'POST', headers: jsonHeaders, body: '{}' });
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /unavailable/i);
  }
  assert.equal((await fetch(`${base}/api/posts`, { method: 'POST', headers: jsonHeaders, body: '{}' })).status, 400);
  assert.equal((await fetch(`${base}/api/unknown`)).status, 404);
});

test('existing chat and quiz contracts remain reachable after modularization', async t => {
  const ai = {
    chats: { create: () => ({ sendMessageStream: async function* () { yield { text: 'Hello student' }; } }) },
    models: { generateContent: async () => ({ text: JSON.stringify({ title: 'Quiz', parts: [{ partTitle: 'Part 1', questions: [{ question: '2+2?', options: ['3', '4'], answer: '4' }] }] }) }) },
  };
  const { base } = await fixture(t, { ai });
  const chat = await fetch(`${base}/api/chat`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ message: 'Hello', history: [] }) });
  assert.match(chat.headers.get('content-type'), /text\/event-stream/);
  assert.match(await chat.text(), /Hello student[\s\S]*\[DONE\]/);
  const quiz = await fetch(`${base}/api/quiz/generate`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ topic: 'Math', items: 1, parts: 1, partTypes: { 0: 'multiple choice' } }) });
  assert.equal(quiz.status, 200);
  assert.equal((await quiz.json()).parts[0].questions[0].answer, '4');
});

test('both quiz endpoints reject malformed model options before returning success', async t => {
  const invalidQuiz = { title: 'Invalid model quiz', parts: [{ partTitle: 'Part 1', questions: [{ question: '2+2?', options: [{}], answer: '4' }] }] };
  const ai = {
    files: { upload: async () => ({ name: 'files/fixture', uri: 'https://example.invalid/fixture.txt', mimeType: 'text/plain' }), delete: async () => {} },
    models: { generateContent: async () => ({ text: JSON.stringify(invalidQuiz) }) },
  };
  const { base } = await fixture(t, { ai });
  const topicResponse = await fetch(`${base}/api/quiz/generate`, {
    method: 'POST', headers: jsonHeaders,
    body: JSON.stringify({ topic: 'Math', items: 1, parts: 1, partTypes: { 0: 'multiple choice' } }),
  });
  assert.equal(topicResponse.status, 502);
  assert.equal(typeof (await topicResponse.json()).error, 'string');

  const body = new FormData();
  body.set('document', new Blob(['QA notes'], { type: 'text/plain' }), 'notes.txt');
  body.set('items', '1'); body.set('parts', '1'); body.set('partTypes', JSON.stringify({ 0: 'multiple choice' }));
  const documentResponse = await fetch(`${base}/api/quiz/generate-from-file`, { method: 'POST', headers: authHeaders, body });
  assert.equal(documentResponse.status, 502);
  assert.equal(typeof (await documentResponse.json()).error, 'string');
});
