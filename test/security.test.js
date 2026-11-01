import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createApp } from '../server/app.js';
import { readServerConfig } from '../src/security/server/config.js';
import { checkPublicEnv } from '../src/security/build/checkPublicEnv.js';

const alice = { Authorization: 'Bearer alice', 'Content-Type': 'application/json' };
const bob = { Authorization: 'Bearer bob', 'Content-Type': 'application/json' };
async function setup(t, options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'share-security-'));
  const config = { dataDir: path.join(root, 'data'), uploadsDir: path.join(root, 'uploads'), tempDir: path.join(root, 'temp'),
    verifyAccessToken: async token => ['alice', 'bob'].includes(token) ? { id: token, user_metadata: { display_name: token === 'alice' ? 'Alice' : 'Bob' } } : null, ...options };
  const server = createApp(config).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(root, { recursive: true, force: true }); });
  return { base: `http://127.0.0.1:${server.address().port}`, config };
}
const create = (base, headers = alice, body = { title: 'Shared notes', subject: 'DSA' }) => fetch(`${base}/api/posts`, { method: 'POST', headers, body: JSON.stringify(body) });

test('protected endpoints reject missing and forged sessions before uploads or AI calls', async t => {
  const { base, config } = await setup(t);
  for (const endpoint of ['/api/posts', '/api/chat', '/api/quiz/generate', '/api/quiz/generate-from-file']) {
    assert.equal((await fetch(`${base}${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
  }
  assert.equal((await create(base, { ...alice, Authorization: 'Bearer forged' })).status, 401);
  assert.equal((await fetch(`${base}/api/me`)).status, 401);
  assert.deepEqual(await readdir(config.uploadsDir), []);
  assert.deepEqual(await readdir(config.tempDir), []);
});

test('resource ownership comes from verified identity and only the owner can delete', async t => {
  const { base } = await setup(t);
  const response = await create(base, alice, { title: 'Owner test', ownerId: 'bob', author: 'Impersonated person' });
  assert.equal(response.status, 201);
  const { post } = await response.json();
  assert.equal(post.ownerId, 'alice'); assert.equal(post.author, 'Alice');
  assert.equal((await fetch(`${base}/api/posts/${post.id}`, { method: 'DELETE', headers: bob })).status, 403);
  assert.equal((await fetch(`${base}/api/posts/${post.id}`)).status, 200);
  assert.equal((await fetch(`${base}/api/posts/${post.id}`, { method: 'DELETE', headers: alice })).status, 200);
});

test('API and authentication endpoints enforce per-IP rate limits', async t => {
  const api = await setup(t, { rateLimits: { api: 2 } });
  await fetch(`${api.base}/api/health`); await fetch(`${api.base}/api/health`);
  const blocked = await fetch(`${api.base}/api/health`);
  assert.equal(blocked.status, 429); assert.ok(blocked.headers.get('retry-after'));
  const auth = await setup(t, { rateLimits: { auth: 2 } });
  for (let index = 0; index < 2; index++) assert.equal((await fetch(`${auth.base}/api/auth/login`, { method: 'POST', headers: alice, body: '{}' })).status, 400);
  assert.equal((await fetch(`${auth.base}/api/auth/login`, { method: 'POST', headers: alice, body: '{}' })).status, 429);
});

test('write and AI usage limits are keyed to verified users', async t => {
  const { base } = await setup(t, { rateLimits: { writes: 1, ai: 1 } });
  assert.equal((await create(base)).status, 201);
  assert.equal((await create(base)).status, 429);
  assert.equal((await create(base, bob)).status, 201);
  assert.equal((await fetch(`${base}/api/chat`, { method: 'POST', headers: alice, body: '{}' })).status, 503);
  assert.equal((await fetch(`${base}/api/chat`, { method: 'POST', headers: alice, body: '{}' })).status, 429);
});

test('CORS only permits configured origins and security headers are present', async t => {
  const { base } = await setup(t);
  const allowed = await fetch(`${base}/api/health`, { headers: { Origin: 'http://localhost:5173' } });
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  const rejected = await fetch(`${base}/api/health`, { headers: { Origin: 'https://attacker.invalid' } });
  assert.equal(rejected.status, 403); assert.equal(rejected.headers.get('access-control-allow-origin'), null);
  assert.equal(allowed.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(allowed.headers.get('x-frame-options'), 'DENY');
  assert.equal(allowed.headers.get('x-powered-by'), null);
  assert.match(allowed.headers.get('content-security-policy'), /object-src 'none'/);
});

test('malformed/oversized JSON and invalid field types produce safe client errors', async t => {
  const { base } = await setup(t);
  const malformed = await fetch(`${base}/api/posts`, { method: 'POST', headers: alice, body: '{bad json' });
  assert.equal(malformed.status, 400); assert.doesNotMatch(await malformed.text(), /SyntaxError|stack|node_modules/);
  assert.equal((await create(base, alice, { title: 'x'.repeat(70 * 1024) })).status, 413);
  assert.equal((await create(base, alice, { title: { value: 'not text' } })).status, 400);
  assert.equal((await create(base, alice, { title: 'a'.repeat(201) })).status, 400);
  assert.equal((await create(base, alice, { title: 'Notes', subject: 'invalid' })).status, 400);
  assert.equal((await fetch(`${base}/api/posts?q=a&q=b`)).status, 400);
});

test('uploads enforce MIME/extension/signature and size limits and clean rejected files', async t => {
  const { base, config } = await setup(t);
  const send = async (content, mime, name) => {
    const body = new FormData(); body.set('title', 'Attachment'); body.set('file', new Blob([content], { type: mime }), name);
    return fetch(`${base}/api/posts`, { method: 'POST', headers: { Authorization: 'Bearer alice' }, body });
  };
  assert.equal((await send('<script>alert(1)</script>', 'text/html', 'attack.html')).status, 400);
  assert.equal((await send('not a real PNG', 'image/png', 'fake.png')).status, 400);
  assert.equal((await send('x'.repeat(10 * 1024 * 1024 + 1), 'text/plain', 'large.txt')).status, 413);
  assert.deepEqual(await readdir(config.uploadsDir), []);
});

test('unlisted private/legacy files cannot be downloaded and shared resources force attachment', async t => {
  const { base, config } = await setup(t);
  await writeFile(path.join(config.uploadsDir, 'private.txt'), 'Private AI notes');
  assert.equal((await fetch(`${base}/uploads/private.txt`)).status, 404);
  const body = new FormData(); body.set('title', 'Resource'); body.set('file', new Blob(['shared'], { type: 'text/plain' }), 'notes.txt');
  const { post } = await (await fetch(`${base}/api/posts`, { method: 'POST', headers: { Authorization: 'Bearer alice' }, body })).json();
  const download = await fetch(`${base}${post.file.url}`);
  assert.equal(download.status, 200); assert.match(download.headers.get('content-disposition'), /^attachment;/);
  assert.equal(download.headers.get('x-content-type-options'), 'nosniff');
});

test('configuration fails closed for public secrets and incomplete production setup', () => {
  assert.throws(() => checkPublicEnv({ VITE_GEMINI_API_KEY: 'do-not-expose' }), /server-only/);
  assert.throws(() => checkPublicEnv({ VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_bad' }), /publishable key/);
  assert.throws(() => readServerConfig({ NODE_ENV: 'production' }), /Production requires/);
  assert.throws(() => readServerConfig({ PORT: 'NaN' }), /PORT/);
  assert.throws(() => readServerConfig({ APP_ORIGINS: '*' }), /exact/);
});

test('AI budget is bounded across users and IP request bursts', async t => {
  const shared = await setup(t, { rateLimits: { aiGlobal: 1 } });
  assert.equal((await fetch(`${shared.base}/api/chat`, { method: 'POST', headers: alice, body: '{}' })).status, 503);
  assert.equal((await fetch(`${shared.base}/api/chat`, { method: 'POST', headers: bob, body: '{}' })).status, 429);
  const ip = await setup(t, { rateLimits: { aiIp: 1 } });
  await fetch(`${ip.base}/api/chat`, { method: 'POST', headers: alice, body: '{}' });
  assert.equal((await fetch(`${ip.base}/api/chat`, { method: 'POST', headers: bob, body: '{}' })).status, 429);
});

test('production serves only built assets with HTTPS headers and real HTTP 404s', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'share-static-'));
  await mkdir(path.join(root, 'dist'));
  await writeFile(path.join(root, 'dist', 'index.html'), '<!doctype html><title>S.H.A.R.E</title>');
  await writeFile(path.join(root, '.env'), 'PRIVATE_VALUE=not-public');
  t.after(() => rm(root, { recursive: true, force: true }));
  const { base } = await setup(t, { production: true, staticDir: path.join(root, 'dist') });
  const page = await fetch(base);
  assert.equal(page.status, 200); assert.match(await page.text(), /S.H.A.R.E/);
  assert.match(page.headers.get('strict-transport-security'), /max-age=31536000/);
  assert.equal((await fetch(`${base}/.env`)).status, 404);
  assert.equal((await fetch(`${base}/src/security/server/config.js`)).status, 404);
  assert.equal((await fetch(`${base}/unknown-page`)).status, 404);
});
