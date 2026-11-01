import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { createAuthRouter } from '../src/security/server/authRoutes.js';

async function fixture(t, createAuthClient, recoveryRedirectTo) {
  const app = express();
  app.use(express.json({ limit: '16kb' }));
  app.use('/api/auth', createAuthRouter({ createAuthClient, recoveryRedirectTo }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  return async (action, body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/${action}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json(), headers: response.headers };
  };
}
const credentials = { email: 'student@example.test', password: 'ten letters plus' };

test('auth fails closed without configuration and never accepts synthetic identities', async t => {
  const request = await fixture(t);
  const result = await request('login', { ...credentials, user: { id: 'pretend' } });
  assert.equal(result.status, 503);
  assert.match(result.headers.get('cache-control'), /no-store/);
  assert.equal(result.body.session, undefined);
});

test('invalid input is rejected before contacting the auth provider', async t => {
  let calls = 0;
  const request = await fixture(t, () => { calls++; return {}; });
  const invalid = [
    ['login', { email: 'not-an-email', password: 'x' }],
    ['login', { ...credentials, email: `${'a'.repeat(250)}@a.test` }],
    ['login', { ...credentials, password: 123 }],
    ['login', { ...credentials, password: 'a'.repeat(129) }],
    ['signup', { ...credentials, name: 'Student', password: 'short' }],
    ['signup', { ...credentials, name: 'a'.repeat(81) }],
    ['signup', { ...credentials, name: '\u0001\u0002' }],
    ['recover', { email: ['student@example.test'] }],
  ];
  for (const [action, body] of invalid) assert.equal((await request(action, body)).status, 400);
  assert.equal(calls, 0);
});

test('login delegates credentials using separate clients and returns only session tokens', async t => {
  let clients = 0;
  const calls = [];
  const request = await fixture(t, () => {
    clients++;
    return { auth: { signInWithPassword: async body => {
      calls.push(body);
      return { data: { session: { access_token: 'fixture-access', refresh_token: 'fixture-refresh', user: { secret: 'hidden' } } }, error: null };
    } } };
  });
  for (let i = 0; i < 2; i++) {
    const result = await request('login', { ...credentials, email: ` ${credentials.email} ` });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { session: { access_token: 'fixture-access', refresh_token: 'fixture-refresh' } });
  }
  assert.equal(clients, 2);
  assert.deepEqual(calls, [credentials, credentials]);
});

test('provider login errors stay generic and preserve rate limiting', async t => {
  let status = 400;
  const request = await fixture(t, () => ({ auth: { signInWithPassword: async () => ({ error: { status, message: 'sensitive provider account information' } }) } }));
  assert.deepEqual((await request('login', credentials)).body, { error: 'Invalid email or password.' });
  status = 429;
  assert.equal((await request('login', credentials)).status, 429);
});

test('signup sanitizes display names, keeps authorization metadata out, and handles confirmation', async t => {
  let supplied;
  const request = await fixture(t, () => ({ auth: { signUp: async body => {
    supplied = body;
    return { data: { user: { id: 'fixture-id' }, session: null }, error: null };
  } } }), 'http://localhost:5173/#/login');
  const result = await request('signup', { ...credentials, name: ' Student\u0001 ', app_metadata: { role: 'admin' } });
  assert.equal(result.status, 201);
  assert.deepEqual(supplied, {
    ...credentials,
    options: { data: { display_name: 'Student' }, emailRedirectTo: 'http://localhost:5173/#/login' },
  });
  assert.equal(result.body.session, null);
  assert.match(result.body.message, /confirm/);
});

test('recovery contacts the provider and does not enumerate accounts', async t => {
  let providerError = null;
  const calls = [];
  const request = await fixture(t, () => ({ auth: { resetPasswordForEmail: async (...args) => {
    calls.push(args);
    return { data: {}, error: providerError };
  } } }), 'https://share.example.test/');
  const success = await request('recover', { email: credentials.email });
  providerError = { status: 400, message: 'user not found' };
  const unknown = await request('recover', { email: 'unknown@example.test' });
  assert.equal(success.status, 200);
  assert.deepEqual(success.body, unknown.body);
  assert.deepEqual(calls[0], [credentials.email, { redirectTo: 'https://share.example.test/' }]);
  providerError = { status: 503, message: 'provider offline' };
  assert.equal((await request('recover', { email: credentials.email })).status, 503);
});

test('unexpected provider exceptions do not disclose credentials or internal messages', async t => {
  const request = await fixture(t, () => { throw new Error('secret project key'); });
  const result = await request('login', credentials);
  assert.equal(result.status, 503);
  assert.doesNotMatch(JSON.stringify(result.body), /secret|project|key|ten letters/);
});
