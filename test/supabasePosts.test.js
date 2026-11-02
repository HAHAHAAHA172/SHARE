import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createApp } from '../server/app.js';
import { mapSupabasePost } from '../server/core/supabasePosts.js';
import { dataClientFactory } from '../src/security/server/config.js';

const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';
const auth = { Authorization: 'Bearer alice-token' };

function provider() {
  const state = { posts: [], materials: [], files: new Map(), calls: [], fail: '', profile: true };
  function client(token) {
    state.calls.push({ token });
    return {
      from(table) {
        let operation = 'select', payload, single = false, count = false;
        const filters = [];
        const query = {
          select(_columns, options = {}) { count = options.count; return query; },
          eq(name, value) { filters.push([name, value]); return query; },
          order() { return query; }, limit() { return query; },
          maybeSingle() { single = true; return query; },
          insert(value) { operation = 'insert'; payload = value; return query; },
          delete() { operation = 'delete'; return query; },
          then(resolve, reject) {
            return Promise.resolve().then(() => {
              state.calls.push({ table, operation, filters, payload });
              if (state.fail === `${table}:${operation}`) return { error: { code: 'XX000', message: 'provider secret' }, data: null };
              if (table === 'user_profile') return { data: state.profile ? { user_id: alice } : null, error: null };
              const rows = state[table];
              const matches = row => filters.every(([key, value]) => row[key] === value);
              if (operation === 'insert') { rows.push(payload); return { data: null, error: null }; }
              const selected = rows.filter(matches);
              if (operation === 'delete') state[table] = rows.filter(row => !matches(row));
              const data = selected.map(row => table === 'posts' ? { ...row, materials: state.materials.filter(file => file.post_id === row.id) } : row);
              return { data: single ? data[0] || null : data, error: null, ...(count ? { count: data.length } : {}) };
            }).then(resolve, reject);
          },
        };
        return query;
      },
      storage: { from(bucket) {
        assert.equal(bucket, 'post-files');
        return {
          async upload(name, bytes, options) { state.files.set(name, { bytes, options }); return { data: { path: name }, error: null }; },
          async remove(names) { for (const name of names) state.files.delete(name); return { data: names, error: null }; },
          async createSignedUrl(name, expires, options) {
            state.calls.push({ signed: name, expires, options });
            return { data: { signedUrl: 'https://example.supabase.co/storage/v1/object/sign/post-files/file?token=test' }, error: null };
          },
        };
      } },
    };
  }
  return { state, client };
}

async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'share-supabase-'));
  const service = provider();
  const uploadsDir = path.join(directory, 'uploads');
  const server = createApp({ dataDir: path.join(directory, 'data'), uploadsDir, tempDir: path.join(directory, 'temp'),
    createDataClient: service.client,
    verifyAccessToken: async token => token === 'alice-token' ? { id: alice, user_metadata: { display_name: 'Alice' } } : token === 'bob-token' ? { id: bob } : null,
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); });
  return { base: `http://127.0.0.1:${server.address().port}`, uploadsDir, ...service };
}

async function publish(base, attachment = true) {
  const body = new FormData();
  body.set('title', 'Algorithms'); body.set('description', 'Sorting notes'); body.set('subject', 'DSA');
  body.set('ownerId', bob); body.set('author', 'Forged author');
  if (attachment) body.set('file', new Blob(['study notes'], { type: 'text/plain' }), 'notes.txt');
  return fetch(`${base}/api/posts`, { method: 'POST', headers: auth, body });
}

test('Supabase posts preserve API fields, verified ownership, storage paths, and no disk persistence', async t => {
  const { base, state, uploadsDir } = await fixture(t);
  const response = await publish(base);
  assert.equal(response.status, 201);
  const { post } = await response.json();
  assert.equal(post.ownerId, alice); assert.equal(post.author, 'Alice');
  assert.equal(post.subject, 'DSA'); assert.equal(post.description, 'Sorting notes');
  assert.equal(post.file.url, `/api/posts/${post.id}/file`);
  assert.equal(state.materials[0].post_id, post.id);
  assert.ok(state.materials[0].storage_path.startsWith(`${alice}/${post.id}/`));
  assert.equal(state.posts[0].post_status, 'published');
  assert.ok(state.calls.some(call => call.token === 'alice-token'));
  assert.deepEqual(await readdir(uploadsDir), []);
  const feed = await (await fetch(`${base}/api/posts?subject=DSA&q=sorting`)).json();
  assert.equal(feed.count, 1); assert.equal(feed.posts[0].id, post.id);
  assert.equal((await (await fetch(`${base}/api/posts?subject=OS`)).json()).count, 0);
});

test('Supabase downloads issue fresh short-lived attachment links and missing resources return 404', async t => {
  const { base, state } = await fixture(t);
  const { post } = await (await publish(base)).json();
  const response = await fetch(`${base}${post.file.url}`, { redirect: 'manual' });
  assert.equal(response.status, 302); assert.equal(response.headers.get('cache-control'), 'no-store');
  const signing = state.calls.find(call => call.signed);
  assert.equal(signing.expires, 60); assert.equal(signing.options.download, 'notes.txt');
  assert.equal((await fetch(`${base}/api/posts/33333333-3333-4333-8333-333333333333`)).status, 404);
});

test('Supabase deletes reject other owners and remove storage and material children before posts', async t => {
  const { base, state } = await fixture(t);
  const { post } = await (await publish(base)).json();
  assert.equal((await fetch(`${base}/api/posts/${post.id}`, { method: 'DELETE', headers: { Authorization: 'Bearer bob-token' } })).status, 403);
  assert.equal(state.files.size, 1);
  assert.equal((await fetch(`${base}/api/posts/${post.id}`, { method: 'DELETE', headers: auth })).status, 200);
  assert.equal(state.files.size, 0); assert.equal(state.posts.length, 0); assert.equal(state.materials.length, 0);
  const deletes = state.calls.filter(call => call.operation === 'delete');
  assert.deepEqual(deletes.map(call => call.table), ['materials', 'posts']);
});

test('Supabase failed material writes compensate post and storage and clean local temporary files', async t => {
  const { base, state, uploadsDir } = await fixture(t);
  state.fail = 'materials:insert';
  const response = await publish(base);
  assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /provider secret/);
  assert.equal(state.files.size, 0); assert.equal(state.posts.length, 0);
  assert.deepEqual(await readdir(uploadsDir), []);
});

test('Supabase profile prerequisites and authentication fail before persistent writes', async t => {
  const { base, state } = await fixture(t);
  state.profile = false;
  assert.equal((await publish(base)).status, 409);
  assert.equal(state.posts.length, 0); assert.equal(state.files.size, 0);
  assert.equal((await fetch(`${base}/api/posts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
});

test('existing plain-text Supabase posts remain readable', () => {
  const post = mapSupabasePost({ id: 'example', title: 'Old notes', content: 'Plain description', user_id: alice, materials: [] });
  assert.equal(post.description, 'Plain description'); assert.equal(post.subject, 'General'); assert.equal(post.file, null);
});

test('real Supabase SDK clients forward only the current request token', async t => {
  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    requests.push(new Headers(options.headers).get('Authorization'));
    return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const factory = dataClientFactory({ supabaseUrl: 'https://example.supabase.co', publishableKey: 'sb_publishable_test' });
  await factory('alice-token').from('posts').select('id');
  await factory('bob-token').from('posts').select('id');
  await factory().from('posts').select('id');
  assert.deepEqual(requests, ['Bearer alice-token', 'Bearer bob-token', 'Bearer sb_publishable_test']);
});
