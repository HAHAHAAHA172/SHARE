// Events invalidate the API snapshot; never merge untrusted/partial realtime rows.
export function watchFeedUpdates({ client, refresh, browser = window, documentRef = document }) {
  let stopped = false;
  let timer;
  let connected = false;
  const schedule = () => {
    if (stopped || timer || documentRef.hidden || browser.navigator.onLine === false) return;
    timer = browser.setTimeout(() => { timer = undefined; if (!stopped) refresh(); }, 300);
  };
  const channel = client?.channel(`share-feed-${crypto.randomUUID()}`);
  for (const table of ['posts', 'likes', 'comments']) {
    channel?.on('postgres_changes', { event: '*', schema: 'public', table }, schedule);
  }
  channel?.subscribe(status => {
    connected = status === 'SUBSCRIBED';
    if (connected) schedule(); // Recover events missed while disconnected.
  });
  // Periodic reconciliation also catches RLS-hidden transitions (e.g. removal).
  let ticks = 0;
  const interval = browser.setInterval(() => {
    ticks += 1;
    if (!connected || ticks % 4 === 0) schedule();
  }, 15000);
  browser.addEventListener('online', schedule);
  browser.addEventListener('focus', schedule);
  documentRef.addEventListener('visibilitychange', schedule);
  return () => {
    stopped = true;
    browser.clearTimeout(timer);
    browser.clearInterval(interval);
    browser.removeEventListener('online', schedule);
    browser.removeEventListener('focus', schedule);
    documentRef.removeEventListener('visibilitychange', schedule);
    if (channel) void client.removeChannel(channel);
  };
}
