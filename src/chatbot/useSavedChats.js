import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../shared/api.js';

export const newChat = () => ({ id: crypto.randomUUID(), title: 'New Conversation', messages: [], loaded: true });
async function request(path, options) {
  const response = await apiFetch(`/api/conversations${path}`, options);
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Conversation storage is unavailable.');
  return result;
}
export default function useSavedChats(isTyping) {
  const [chats, setChats] = useState(() => [newChat()]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const saved = useRef(new Map());
  const saving = useRef(null);
  const removed = useRef(new Set());
  const paused = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  useEffect(() => {
    const controller = new AbortController();
    request('', { signal: controller.signal }).then(result => {
      const restored = result.conversations.map(chat => ({ ...chat, messages: [], loaded: false }));
      if (controller.signal.aborted) return;
      if (restored.length) { setChats(restored); setActiveChatId(restored[0].id); }
      setReady(true); setError('');
    }).catch(failure => { if (!controller.signal.aborted) { setError(failure.message); setReady(false); } });
    return () => controller.abort();
  }, [revision]);

  const active = chats.find(chat => chat.id === activeChatId) || chats[0];
  useEffect(() => {
    if (!ready || !active || active.loaded) return;
    const controller = new AbortController();
    request(`/${active.id}/messages`, { signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      saved.current.set(active.id, { title: active.title, ids: new Set(result.messages.map(message => message.id)) });
      setChats(previous => previous.map(chat => chat.id === active.id ? { ...chat, messages: result.messages, loaded: true } : chat));
      setError('');
    }).catch(failure => { if (!controller.signal.aborted) setError(failure.message); });
    return () => controller.abort();
  }, [active, ready, loadAttempt]);

  const [saveTick, setSaveTick] = useState(0);
  useEffect(() => {
    if (!ready || isTyping || paused.current || saving.current) return;
    const dirty = chats.find(chat => {
      if (!chat.loaded || removed.current.has(chat.id)) return false;
      const existing = saved.current.get(chat.id);
      return (chat.messages.length > 0 || existing) && (!existing || existing.title !== chat.title || chat.messages.some(message => !existing.ids.has(message.id)));
    });
    if (!dirty) return;
    const timer = setTimeout(() => {
      const existing = saved.current.get(dirty.id) || { title: '', ids: new Set() };
      const pending = dirty.messages.filter(message => !existing.ids.has(message.id));
      // Keep request batches below the API body limit, including long AI replies.
      const batch = [];
      let bytes = 0;
      for (const message of pending) {
        const wire = { id: message.id, role: message.role, text: message.text || (message.fileName ? `Attached file: ${message.fileName}` : ''), fileName: message.fileName || null, duration: message.duration ?? null, quizResult: message.quizResult || null, createdAt: message.createdAt };
        const size = new TextEncoder().encode(JSON.stringify(wire)).length;
        if (batch.length && (bytes + size > 400000 || batch.length >= 20)) break;
        batch.push(wire); bytes += size;
      }
      const operation = request(`/${dirty.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: dirty.title, messages: batch }) });
      saving.current = operation;
      operation.then(() => {
        batch.forEach(message => existing.ids.add(message.id));
        saved.current.set(dirty.id, { title: dirty.title, ids: existing.ids });
        if (alive.current) setError('');
      }).catch(failure => {
        paused.current = true;
        if (alive.current) setError(`${failure.message} Your current conversation remains open; retry saving before leaving.`);
      }).finally(() => {
        saving.current = null;
        if (alive.current) setSaveTick(value => value + 1);
      });
    }, 450);
    return () => clearTimeout(timer);
  }, [chats, ready, isTyping, saveTick]);

  const retry = useCallback(() => {
    paused.current = false;
    if (!ready) setRevision(value => value + 1);
    else { setLoadAttempt(value => value + 1); setSaveTick(value => value + 1); }
  }, [ready]);
  const deleteSaved = useCallback(async id => {
    removed.current.add(id);
    try {
      if (saving.current) await saving.current.catch(() => {});
      if (saved.current.has(id) || chats.find(chat => chat.id === id)?.loaded === false) await request(`/${id}`, { method: 'DELETE' });
      saved.current.delete(id);
    } catch (failure) { removed.current.delete(id); setError(failure.message); throw failure; }
  }, [chats]);
  return { chats, setChats, activeChatId: active?.id, setActiveChatId, historyReady: ready && active?.loaded !== false, historyError: error, retryHistory: retry, deleteSaved };
}
