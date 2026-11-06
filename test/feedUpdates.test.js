import { test } from 'node:test';
import assert from 'node:assert/strict';
import { watchFeedUpdates } from '../src/core/feedUpdates.js';

function setup(clientEnabled = true) {
  const browser = new EventTarget();
  const documentRef = new EventTarget();
  browser.navigator = { onLine: true };
  documentRef.hidden = false;
  const timers = new Map();
  let id = 0, interval, status, refreshes = 0, removed = 0;
  browser.setTimeout = callback => { timers.set(++id, callback); return id; };
  browser.clearTimeout = key => timers.delete(key);
  browser.setInterval = callback => { interval = callback; return ++id; };
  browser.clearInterval = () => { interval = null; };
  const handlers = [];
  const channel = {
    on: (_type, filter, callback) => { handlers.push({ filter, callback }); return channel; },
    subscribe: callback => { status = callback; return channel; },
  };
  const client = { channel: () => channel, removeChannel: () => { removed++; } };
  const stop = watchFeedUpdates({ client: clientEnabled ? client : null, browser, documentRef, refresh: () => refreshes++ });
  return { browser, documentRef, handlers, stop,
    status: value => status(value), tick: () => interval?.(),
    flush: () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(fn => fn()); },
    counts: () => ({ refreshes, removed, timers: timers.size }),
  };
}

test('realtime bursts are coalesced and reconnect reconciles the snapshot', () => {
  const f = setup();
  assert.deepEqual(f.handlers.map(h => h.filter.table), ['posts', 'likes', 'comments']);
  f.handlers.forEach(h => h.callback());
  f.flush();
  assert.equal(f.counts().refreshes, 1);
  f.status('SUBSCRIBED'); f.flush();
  f.status('CHANNEL_ERROR'); f.tick(); f.flush();
  assert.equal(f.counts().refreshes, 3);
  f.stop();
});

test('fallback works without Supabase, pauses while hidden, and cleans up', () => {
  const f = setup(false);
  f.tick(); f.flush();
  assert.equal(f.counts().refreshes, 1);
  f.documentRef.hidden = true; f.tick(); f.flush();
  assert.equal(f.counts().refreshes, 1);
  f.documentRef.hidden = false;
  f.documentRef.dispatchEvent(new Event('visibilitychange')); f.flush();
  assert.equal(f.counts().refreshes, 2);
  f.browser.dispatchEvent(new Event('focus'));
  f.stop(); f.flush();
  f.browser.dispatchEvent(new Event('online')); f.flush();
  assert.equal(f.counts().refreshes, 2);
});

test('connected clients reconcile periodically and unsubscribe on exit', () => {
  const f = setup();
  f.status('SUBSCRIBED'); f.flush();
  for (let i = 0; i < 4; i++) f.tick();
  f.flush();
  assert.equal(f.counts().refreshes, 2);
  f.stop();
  f.handlers[0].callback(); f.flush();
  assert.equal(f.counts().removed, 1);
  assert.equal(f.counts().refreshes, 2);
});
