import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once, EventEmitter } from 'node:events';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createChatbotRouter } from '../../../server/chatbot/routes.js';
import { createRequestContext, validateChat, validateQuizRequest, writeEvent } from './ai.js';

const validQuiz = { title: 'Quiz', parts: [{ partTitle: 'Part 1', questions: [{ question: '2+2?', options: ['3', '4'], answer: '4' }] }] };
const settings = { topic: 'Math', items: 1, parts: 1, partTypes: { 0: 'multiple choice' } };

async function fixture(t, ai, options = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'share-ai-'));
  const app = express();
  app.use(express.json({ limit: '128kb' }));
  app.use('/api', createChatbotRouter({ ai, uploadsDir: directory, ...options }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const post = (endpoint, body) => fetch(`${base}${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { base, post, directory };
}

function attachment(text = 'Study notes', name = 'notes.txt', mimeType = 'text/plain') {
  const body = new FormData();
  body.set('document', new Blob([text], { type: mimeType }), name);
  for (const [key, value] of Object.entries(settings)) body.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  return body;
}

async function eventually(check) {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail('Expected asynchronous cleanup did not finish');
}

test('chat validates history, character budgets, and duplicate current messages', () => {
  for (const body of [
    {}, { message: [] }, { message: 'x'.repeat(8001) },
    { message: 'Hi', history: '{' }, { message: 'Hi', history: {} },
    { message: 'Hi', history: Array(13).fill({ role: 'user', text: 'Hi' }) },
    { message: 'Hi', history: [{ role: 'system', text: 'Hi' }] },
    { message: 'Hi', history: [{ role: 'user', text: {} }] },
    { message: 'Hi', history: Array(5).fill({ role: 'user', text: 'x'.repeat(8000) }) },
  ]) assert.throws(() => validateChat(body, false), error => error.status === 400);
  assert.deepEqual(validateChat({ message: 'Hi', history: [{ role: 'user', text: 'Hi' }] }, false).history, []);
  assert.equal(validateChat({}, true).message, '');
});

test('quiz validates bounded integer counts, part types and instructions', () => {
  for (const overrides of [
    { items: 51 }, { items: 0 }, { items: '1x' }, { items: 1.1 }, { parts: 4 }, { parts: 2 },
    { partTypes: '{' }, { partTypes: {} }, { partTypes: { 0: 'javascript' } },
    { partTypes: { 0: 'multiple choice', 99: 'enumeration' } },
    { topic: 'x'.repeat(2001) }, { instructions: {} },
  ]) assert.throws(() => validateQuizRequest({ ...settings, ...overrides }), error => error.status === 400);
  assert.equal(validateQuizRequest({ ...settings, items: '50', parts: '3', partTypes: ['enumeration', 'true or false', 'multiple choice'] }).items, 50);
});

test('invalid request bodies never invoke the provider and missing document returns 400', async t => {
  let called = 0;
  const { post } = await fixture(t, { models: { generateContent: () => { called++; } }, chats: { create: () => { called++; } } });
  assert.equal((await post('/chat', { message: 'Hi', history: '{' })).status, 400);
  assert.equal((await post('/quiz/generate', { ...settings, items: 51 })).status, 400);
  assert.equal((await post('/quiz/generate-from-file', settings)).status, 400);
  assert.equal(called, 0);
});

test('chat streams with the configured token budget and normalized history', async t => {
  let captured;
  const { post } = await fixture(t, { chats: { create: options => {
    captured = options;
    return { sendMessageStream: async function* () { yield { text: 'Hello student' }; } };
  } } }, { maxOutputTokens: 123 });
  const response = await post('/chat', { message: 'Hi', history: [{ role: 'user', text: 'Hi' }] });
  assert.match(response.headers.get('content-type'), /text\/event-stream/);
  assert.match(await response.text(), /Hello student[\s\S]*\[DONE\]/);
  assert.equal(captured.config.maxOutputTokens, 123);
  assert.equal(captured.config.abortSignal instanceof AbortSignal, true);
  assert.deepEqual(captured.history, []);
  assert.doesNotMatch(captured.config.systemInstruction, /nah bro|quantum/);
});

test('provider timeout bounds noncooperative requests and aborts the SDK signal', async t => {
  let signal;
  const { post } = await fixture(t, { models: { generateContent: ({ config }) => { signal = config.abortSignal; return new Promise(() => {}); } } }, { aiTimeoutMs: 25 });
  const response = await post('/quiz/generate', settings);
  assert.equal(response.status, 504);
  assert.equal(signal.aborted, true);
});

test('a disconnected client aborts an in-flight provider request', async t => {
  let started;
  const providerStarted = new Promise(resolve => { started = resolve; });
  let signal;
  const { base } = await fixture(t, { models: { generateContent: ({ config }) => {
    signal = config.abortSignal;
    started();
    return new Promise(() => {});
  } } });
  const controller = new AbortController();
  const response = fetch(`${base}/quiz/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings), signal: controller.signal,
  });
  const rejection = assert.rejects(response, error => error.name === 'AbortError');
  await providerStarted;
  controller.abort();
  await rejection;
  await eventually(() => signal.aborted);
});

test('provider output is bounded, schema checked, and provider secrets stay private', async t => {
  let result;
  const { post } = await fixture(t, { models: { generateContent: async () => {
    if (result instanceof Error) throw result;
    return { text: result };
  } } });
  for (const output of ['x'.repeat(256 * 1024 + 1), '{', JSON.stringify({ ...validQuiz, parts: [] }), JSON.stringify({ ...validQuiz, parts: Array(4).fill(validQuiz.parts[0]) }), new Error('secret prompt and provider stack')]) {
    result = output;
    const response = await post('/quiz/generate', settings);
    assert.equal(response.status, 502);
    assert.doesNotMatch(await response.text(), /secret prompt|provider stack/);
  }
});

test('local and provider documents are removed after success and provider failure', async t => {
  let fail = false;
  const deleted = [];
  const { base, directory } = await fixture(t, {
    files: { upload: async () => ({ uri: 'https://example.invalid/file', mimeType: 'text/plain', name: 'files/document' }), delete: async ({ name }) => { deleted.push(name); } },
    models: { generateContent: async () => { if (fail) throw new Error('provider failure'); return { text: JSON.stringify(validQuiz) }; } },
  });
  for (const status of [200, 502]) {
    const response = await fetch(`${base}/quiz/generate-from-file`, { method: 'POST', body: attachment() });
    assert.equal(response.status, status);
    await response.text();
    await eventually(async () => (await readdir(directory)).length === 0 && deleted.length === (fail ? 2 : 1));
    fail = true;
  }
  assert.deepEqual(deleted, ['files/document', 'files/document']);
});

test('invalid signatures and unsupported uploads leave no temporary documents', async t => {
  let uploads = 0;
  const { base, directory } = await fixture(t, { files: { upload: async () => { uploads++; } } });
  for (const body of [attachment('not a pdf', 'fake.pdf', 'application/pdf'), attachment('<svg/>', 'file.svg', 'image/svg+xml'), attachment('notes', 'file.html', 'text/plain')]) {
    const response = await fetch(`${base}/quiz/generate-from-file`, { method: 'POST', body });
    assert.equal(response.status, 400);
    await response.text();
    await eventually(async () => (await readdir(directory)).length === 0);
  }
  assert.equal(uploads, 0);
});

test('an upload that resolves after a timeout is still deleted at the provider', async t => {
  let finishUpload;
  const deleted = [];
  const { base, directory } = await fixture(t, { files: {
    upload: () => new Promise(resolve => { finishUpload = resolve; }),
    delete: async ({ name }) => { deleted.push(name); },
  } }, { aiTimeoutMs: 25 });
  const response = await fetch(`${base}/quiz/generate-from-file`, { method: 'POST', body: attachment() });
  assert.equal(response.status, 504);
  finishUpload({ name: 'files/late', uri: 'https://example.invalid/late', mimeType: 'text/plain' });
  await eventually(async () => (await readdir(directory)).length === 0 && deleted.length === 1);
});

test('stream errors use SSE after output starts and output limits abort generation', async t => {
  let signal;
  const { post } = await fixture(t, { chats: { create: ({ config }) => {
    signal = config.abortSignal;
    return { sendMessageStream: async function* () { yield { text: 'Hello' }; yield { text: 'x'.repeat(256 * 1024) }; } };
  } } });
  const response = await post('/chat', { message: 'Hi' });
  const output = await response.text();
  assert.equal(response.status, 200);
  assert.match(output, /Hello[\s\S]*"error"/);
  assert.doesNotMatch(output, /\[DONE\]/);
  assert.ok(output.length < 1000);
  assert.equal(signal.aborted, true);
});

test('backpressure waits for drain and client disconnection cancels it', async () => {
  const req = new EventEmitter();
  const res = new EventEmitter();
  res.write = () => false;
  const context = createRequestContext(req, res, 1000);
  let finished = false;
  const writing = writeEvent(res, { text: 'hello' }, context).then(() => { finished = true; });
  await Promise.resolve();
  assert.equal(finished, false);
  res.emit('drain');
  await writing;
  assert.equal(finished, true);
  const stalled = writeEvent(res, { text: 'next' }, context);
  res.emit('close');
  await assert.rejects(stalled, error => error.status === 499);
  assert.equal(context.signal.aborted, true);
  assert.equal(res.listenerCount('drain'), 0);
  context.dispose();
});
