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
  const state = { posts: [], materials: [], likes: [], comments: [], files: new Map(), calls: [], fail: '', profile: true };
  function client(token) {
    state.calls.push({ token });
    return {
      from(table) {
        let operation = 'select', payload, single = false, count = false, interval, disjunction, maximum;
        const filters = [];
        const orders = [];
        const query = {
          select(_columns, options = {}) { count = options.count; return query; },
          eq(name, value) { filters.push([name, value]); return query; },
          in(name, values) { filters.push([name, values]); return query; },
          or(value) { disjunction = value; return query; },
          order(name, options = {}) { orders.push([name, options]); return query; },
          limit(value) { maximum = value; return query; },
          range(start, end) { interval = [start, end]; return query; },
          maybeSingle() { single = true; return query; },
          insert(value) { operation = 'insert'; payload = value; return query; },
          upsert(value) { operation = 'upsert'; payload = value; return query; },
          update(value) { operation = 'update'; payload = value; return query; },
          delete() { operation = 'delete'; return query; },
          then(resolve, reject) {
            return Promise.resolve().then(() => {
              state.calls.push({ table, operation, filters, payload, interval, disjunction, orders, maximum, count });
              if (state.fail === `${table}:${operation}`) return { error: { code: 'XX000', message: 'provider secret' }, data: null };
              if (table === 'user_profile') return { data: single ? (state.profile ? { user_id: alice } : null) : [{ user_id: alice, full_name: 'Alice' }, { user_id: bob, full_name: 'Bob' }], error: null };
              const rows = state[table];
              const searchFilters = disjunction ? [...disjunction.matchAll(/(\w+)\.ilike\.("(?:\\.|[^"\\])*")/g)].map(([, column, value]) => [column, JSON.parse(value).slice(1, -1).replace(/\\([\\%_])/g, '$1').toLowerCase()]) : [];
              const matches = row => filters.every(([key, value]) => key.includes('.') || (Array.isArray(value) ? value.includes(row[key]) : row[key] === value))
                && (!disjunction || searchFilters.some(([column, value]) => String(row[column] || '').toLowerCase().includes(value)));
              if (operation === 'insert') { rows.push(payload); return { data: null, error: null }; }
              if (operation === 'upsert') { if (!rows.some(row => row.post_id === payload.post_id && row.user_id === payload.user_id)) rows.push({ ...payload, likes_id: 'like-id' }); return { data: null, error: null }; }
              const selected = rows.filter(matches);
              if (operation === 'delete') state[table] = rows.filter(row => !matches(row));
              if (operation === 'update') selected.forEach(row => Object.assign(row, payload));
              let data = selected.map(row => table === 'posts' ? { ...row, materials: state.materials.filter(file => file.post_id === row.id), likes: [{ count: state.likes.filter(like => like.post_id === row.id).length }], comments: [{ count: state.comments.filter(comment => comment.post_id === row.id && comment.status === 'published').length }] } : row);
              const total = data.length;
              if (orders.length) data.sort((left, right) => {
                for (const [name, { ascending = true }] of orders) {
                  if (left[name] < right[name]) return ascending ? -1 : 1;
                  if (left[name] > right[name]) return ascending ? 1 : -1;
                }
                return 0;
              });
              if (interval) data = data.slice(interval[0], interval[1] + 1);
              if (maximum !== undefined) data = data.slice(0, maximum);
              return { data: single ? data[0] || null : data, error: null, ...(count ? { count: total } : {}) };
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

async function fixture(t, options = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'share-supabase-'));
  const service = provider();
  const uploadsDir = path.join(directory, 'uploads');
  const server = createApp({ dataDir: path.join(directory, 'data'), uploadsDir, tempDir: path.join(directory, 'temp'),
    createDataClient: options.createDataClient || service.client,
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

test('Supabase feed pages are bounded, consistently ordered, and load likes only for the current page', async t => {
  const { base, state } = await fixture(t);
  for (let index = 0; index < 65; index += 1) {
    state.posts.push({ id: `post-${String(index).padStart(3, '0')}`, user_id: alice, title: `Resource ${index}`, content: 'Notes', subject: 'DSA', post_status: 'published', created_at: '2026-01-01T00:00:00.000Z' });
  }
  const first = await (await fetch(`${base}/api/posts`, { headers: auth })).json();
  assert.equal(first.count, 65); assert.equal(first.posts.length, 24);
  assert.equal(first.page, 1); assert.equal(first.pageSize, 24); assert.equal(first.hasMore, true);
  assert.equal(first.posts[0].id, 'post-064');
  const ownLikes = state.calls.find(call => call.table === 'likes' && call.operation === 'select');
  assert.deepEqual(ownLikes.filters.find(([key]) => key === 'post_id')[1], first.posts.map(post => post.id));
  const second = await (await fetch(`${base}/api/posts?page=2&pageSize=24`)).json();
  assert.equal(second.posts.length, 24); assert.equal(second.posts[0].id, 'post-040');
  assert.ok(second.posts.every(post => !first.posts.some(previous => previous.id === post.id)));
  const last = await (await fetch(`${base}/api/posts?page=3&pageSize=24`)).json();
  assert.equal(last.posts.length, 17); assert.equal(last.hasMore, false);
  const empty = await (await fetch(`${base}/api/posts?page=4`)).json();
  assert.equal(empty.count, 65); assert.deepEqual(empty.posts, []); assert.equal(empty.hasMore, false);
  const largest = await (await fetch(`${base}/api/posts?pageSize=50`)).json();
  assert.equal(largest.posts.length, 50);
  const queries = state.calls.filter(call => call.table === 'posts' && call.operation === 'select');
  assert.ok(queries.every(call => call.interval[1] - call.interval[0] < 50 && call.maximum !== 2000));
});

test('Supabase feed filters and escaped search run before pagination, with strict pagination validation', async t => {
  const { base, state } = await fixture(t);
  const needle = '50%_notes,"(post_status.eq.draft)\\path';
  state.posts.push(
    { id: 'match', title: 'Mixed case', content: needle, subject: 'DSA', post_status: 'published' },
    { id: 'other-subject', title: 'Mixed case', content: needle, subject: 'OS', post_status: 'published' },
    { id: 'hidden', title: 'Mixed case', content: needle, subject: 'DSA', post_status: 'draft' },
    { id: 'wildcard', title: 'Mixed case', content: '50ABnotes', subject: 'DSA', post_status: 'published' },
  );
  const result = await (await fetch(`${base}/api/posts?subject=dsa&q=${encodeURIComponent(needle)}&pageSize=1`)).json();
  assert.equal(result.count, 1); assert.deepEqual(result.posts.map(post => post.id), ['match']);
  assert.equal(result.hasMore, false);
  const query = state.calls.find(call => call.table === 'posts');
  assert.ok(query.filters.some(([key, value]) => key === 'subject' && value === 'DSA'));
  assert.ok(query.disjunction.includes('content.ilike.'));
  const mixedCase = await (await fetch(`${base}/api/posts?q=MIXED`)).json();
  assert.equal(mixedCase.count, 3);
  for (const parameters of ['page=0', 'page=-1', 'page=1.5', 'page=10001', 'page=x', 'pageSize=0', 'pageSize=51', 'pageSize=1.2', 'page=1&page=2', 'subject=invalid']) {
    assert.equal((await fetch(`${base}/api/posts?${parameters}`)).status, 400, parameters);
  }
});

test('Supabase downloads issue fresh short-lived attachment links and missing resources return 404', async t => {
  const { base, state } = await fixture(t);
  const { post } = await (await publish(base)).json();
  assert.equal((await fetch(`${base}${post.file.url}?media=1`)).status, 400);
  const response = await fetch(`${base}${post.file.url}`, { redirect: 'manual' });
  assert.equal(response.status, 302); assert.equal(response.headers.get('cache-control'), 'no-store');
  const signing = state.calls.find(call => call.signed);
  assert.equal(signing.expires, 60); assert.equal(signing.options.download, 'notes.txt');
  state.materials[0].mime_type = 'video/mp4';
  const media = await fetch(`${base}${post.file.url}?media=1`);
  assert.equal(media.status, 200);
  assert.deepEqual(await media.json(), { url: 'https://example.supabase.co/storage/v1/object/sign/post-files/file?token=test' });
  const mediaSigning = state.calls.filter(call => call.signed).at(-1);
  assert.equal(mediaSigning.expires, 300); assert.equal(mediaSigning.options, undefined);
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

test('post hearts persist, are idempotent, use verified identity and survive feed reload', async t => {
  const { base, state } = await fixture(t);
  const { post } = await (await publish(base, false)).json();
  const endpoint = `${base}/api/posts/${post.id}/like`;
  assert.equal((await fetch(endpoint, { method: 'POST' })).status, 401);
  const liked = await (await fetch(endpoint, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: bob }) })).json();
  assert.equal(liked.liked, true); assert.equal(liked.likes, 1); assert.equal(state.likes[0].user_id, alice);
  await fetch(endpoint, { method: 'POST', headers: auth });
  assert.equal(state.likes.length, 1);
  const ownFeed = await (await fetch(`${base}/api/posts`, { headers: auth })).json();
  assert.equal(ownFeed.posts[0].liked, true); assert.equal(ownFeed.posts[0].likes, 1);
  const guest = await (await fetch(`${base}/api/posts/${post.id}/actions`)).json();
  assert.equal(guest.liked, false); assert.equal(guest.likes, 1);
  const unliked = await (await fetch(endpoint, { method: 'DELETE', headers: auth })).json();
  assert.equal(unliked.likes, 0); assert.equal(unliked.liked, false);
});

test('comments persist, validate content and ownership, and delete without losing reply references', async t => {
  const { base, state } = await fixture(t);
  const { post } = await (await publish(base, false)).json();
  const endpoint = `${base}/api/posts/${post.id}/comments`;
  const options = content => ({ method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ content, user_id: bob }) });
  assert.equal((await fetch(endpoint, options(' '.repeat(8)))).status, 400);
  assert.equal((await fetch(endpoint, options('x'.repeat(2001)))).status, 400);
  assert.equal(state.comments.length, 0);
  const response = await fetch(endpoint, options('Useful notes\u0000!'));
  assert.equal(response.status, 201);
  const { comment } = await response.json();
  assert.equal(comment.ownerId, alice); assert.equal(comment.text, 'Useful notes!');
  const list = await (await fetch(endpoint)).json();
  assert.equal(list.comments[0].id, comment.id); assert.equal(list.comments[0].author, 'Alice');
  const actions = await (await fetch(`${base}/api/posts/${post.id}/actions`)).json();
  assert.equal(actions.commentCount, 1);
  assert.equal((await fetch(`${endpoint}/${comment.id}`, { method: 'DELETE', headers: { Authorization: 'Bearer bob-token' } })).status, 403);
  assert.equal((await fetch(`${endpoint}/${comment.id}`, { method: 'DELETE', headers: auth })).status, 200);
  assert.equal(state.comments[0].status, 'deleted');
  assert.equal((await (await fetch(endpoint)).json()).comments.length, 0);
});

test('comments request only the requested bounded page, ordered with a unique tie-breaker', async t => {
  const { base, state } = await fixture(t);
  const { post } = await (await publish(base, false)).json();
  for (let index = 0; index < 65; index += 1) {
    state.comments.push({ comment_id: `comment-${String(index).padStart(3, '0')}`, post_id: post.id, user_id: alice, content: `Comment ${index}`, status: 'published', created_at: '2026-01-01T00:00:00.000Z' });
  }
  state.comments.push({ comment_id: 'deleted', post_id: post.id, user_id: alice, content: 'Hidden', status: 'deleted' });
  const endpoint = `${base}/api/posts/${post.id}/comments`;
  const first = await (await fetch(endpoint)).json();
  const second = await (await fetch(`${endpoint}?page=2`)).json();
  const last = await (await fetch(`${endpoint}?page=3`)).json();
  assert.equal(first.comments.length, 30); assert.equal(second.comments.length, 30); assert.equal(last.comments.length, 5);
  assert.equal(first.count, 65); assert.equal(first.hasMore, true); assert.equal(last.hasMore, false);
  assert.equal(second.comments[0].id, 'comment-030');
  const requests = state.calls.filter(call => call.table === 'comments' && call.operation === 'select');
  assert.deepEqual(requests.map(call => call.interval), [[0, 29], [30, 59], [60, 89]]);
  assert.deepEqual(requests[0].orders.map(([column]) => column), ['created_at', 'comment_id']);
});

test('social requests reject hidden posts, invalid IDs, forged sessions and expose safe provider errors', async t => {
  const { base, state } = await fixture(t);
  const { post } = await (await publish(base, false)).json();
  assert.equal((await fetch(`${base}/api/posts/invalid/actions`)).status, 400);
  assert.equal((await fetch(`${base}/api/posts/${post.id}/actions`, { headers: { Authorization: 'Bearer forged' } })).status, 401);
  state.posts[0].post_status = 'draft';
  assert.equal((await fetch(`${base}/api/posts/${post.id}/like`, { method: 'POST', headers: auth })).status, 404);
  state.posts[0].post_status = 'published'; state.fail = 'likes:select';
  const response = await fetch(`${base}/api/posts/${post.id}/actions`);
  assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /provider secret/);
});

test('feed sends bounded filters and safely quoted search through the real Supabase SDK', async t => {
  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (!String(url).startsWith('https://example.supabase.co/')) return originalFetch(url, options);
    requests.push(new URL(url));
    return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json', 'Content-Range': '*/0' } });
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const factory = dataClientFactory({ supabaseUrl: 'https://example.supabase.co', publishableKey: 'sb_publishable_test' });
  const { base } = await fixture(t, { createDataClient: factory });
  const needle = 'a,b)"\\%_';
  const response = await fetch(`${base}/api/posts?page=2&pageSize=7&subject=DSA&q=${encodeURIComponent(needle)}`);
  assert.equal(response.status, 200);
  const parameters = requests[0].searchParams;
  assert.equal(parameters.get('limit'), '7'); assert.equal(parameters.get('offset'), '7');
  assert.equal(parameters.get('subject'), 'eq.DSA'); assert.equal(parameters.get('post_status'), 'eq.published');
  assert.equal(parameters.get('order'), 'created_at.desc,id.desc');
  const search = parameters.get('or');
  const predicates = [...search.matchAll(/(\w+)\.ilike\.("(?:\\.|[^"\\])*")/g)];
  assert.deepEqual(predicates.map(([, column]) => column), ['title', 'content', 'author', 'subject']);
  for (const [, , value] of predicates) assert.equal(JSON.parse(value), '%a,b)"\\\\\\%\\_%');
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
