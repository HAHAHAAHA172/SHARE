import { Router } from 'express';
import { httpError, text } from '../../src/security/server/validation.js';

const uuid = value => {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw httpError(400, 'Invalid conversation ID.');
  return value;
};
function result(response) {
  if (response.error) {
    if (response.error.code === '42501') throw httpError(403, 'You cannot access this conversation.');
    if (response.error.code === '23503') throw httpError(409, 'Your account profile is not ready. Please sign in again or contact support.');
    throw httpError(503, 'Conversations could not be saved. Please try again.');
  }
  return response.data;
}
function decode(row) {
  let message = { text: row.content };
  try {
    const parsed = JSON.parse(row.content);
    if (parsed?.format === 'pedro-message-v1' && typeof parsed.text === 'string') message = { text: parsed.text, fileName: parsed.fileName || null, duration: parsed.duration ?? null, quizResult: parsed.quizResult || null };
  } catch { /* Existing plain-text messages remain readable. */ }
  return { ...message, id: row.message_id, role: row.role === 'assistant' || row.role === 'bot' ? 'bot' : 'user', createdAt: row.created_at };
}

export function createConversationsRouter({ createDataClient }) {
  const router = Router();
  const clientFor = req => {
    const client = createDataClient?.(req.get('Authorization').slice(7));
    if (!client) throw httpError(503, 'Conversation storage is temporarily unavailable.');
    return client;
  };
  const owned = async (client, id, userId) => {
    const row = result(await client.from('ai_conversations').select('conversations_id').eq('conversations_id', id).eq('user_id', userId).maybeSingle());
    if (!row) throw httpError(404, 'Conversation not found.');
  };
  router.get('/', async (req, res) => {
    const rows = result(await clientFor(req).from('ai_conversations').select('conversations_id,title,updated_at').eq('user_id', req.user.id).order('updated_at', { ascending: false }).limit(100));
    res.set('Cache-Control', 'no-store').json({ conversations: rows.map(row => ({ id: row.conversations_id, title: row.title, updatedAt: row.updated_at })) });
  });
  router.get('/:id/messages', async (req, res) => {
    const id = uuid(req.params.id), client = clientFor(req);
    await owned(client, id, req.user.id);
    const rows = result(await client.from('ai_messages').select('message_id,role,content,created_at').eq('conversatioon_id', id).order('created_at', { ascending: false }).order('message_id', { ascending: false }).limit(1000));
    res.set('Cache-Control', 'no-store').json({ messages: rows.reverse().map(decode) });
  });
  router.put('/:id', async (req, res) => {
    const id = uuid(req.params.id), client = clientFor(req);
    const title = text(req.body.title, { name: 'Conversation title', max: 100, required: true });
    if (!Array.isArray(req.body.messages) || req.body.messages.length > 20) throw httpError(400, 'Send up to 20 messages at a time.');
    const messages = req.body.messages.map(message => {
      if (!message || !['user', 'bot'].includes(message.role)) throw httpError(400, 'Invalid message role.');
      const content = text(message.text, { name: 'Message', max: 262144, required: true });
      const timestamp = Date.parse(message.createdAt);
      if (!Number.isFinite(timestamp)) throw httpError(400, 'Invalid message date.');
      return { message_id: uuid(message.id), conversatioon_id: id, role: message.role === 'bot' ? 'assistant' : 'user',
        content: JSON.stringify({ format: 'pedro-message-v1', text: content, fileName: text(message.fileName, { name: 'Filename', max: 180 }) || null,
          duration: typeof message.duration === 'number' && Number.isFinite(message.duration) && message.duration >= 0 ? message.duration : null,
          quizResult: message.quizResult && typeof message.quizResult === 'object' ? message.quizResult : null }),
        created_at: new Date(timestamp).toISOString() };
    });
    if (Buffer.byteLength(JSON.stringify(messages)) > 430000) throw httpError(413, 'Save fewer messages at a time.');
    const existing = result(await client.from('ai_conversations').select('conversations_id').eq('conversations_id', id).eq('user_id', req.user.id).maybeSingle());
    const now = new Date().toISOString();
    if (!existing) {
      const count = await client.from('ai_conversations').select('conversations_id', { count: 'exact', head: true }).eq('user_id', req.user.id);
      result(count);
      if (count.count >= 100) throw httpError(429, 'You have reached 100 conversations. Delete an older conversation to save a new one.');
      result(await client.from('ai_conversations').insert({ conversations_id: id, user_id: req.user.id, title, created_at: now, updated_at: now }));
    }
    if (messages.length) result(await client.from('ai_messages').upsert(messages, { onConflict: 'message_id', ignoreDuplicates: true }));
    result(await client.from('ai_conversations').update({ title, updated_at: now }).eq('conversations_id', id).eq('user_id', req.user.id));
    res.set('Cache-Control', 'no-store').json({ success: true });
  });
  router.delete('/:id', async (req, res) => {
    const id = uuid(req.params.id), client = clientFor(req);
    await owned(client, id, req.user.id);
    // The existing NOT NULL foreign key uses SET NULL: remove children first.
    result(await client.from('ai_messages').delete().eq('conversatioon_id', id));
    const deleted = result(await client.from('ai_conversations').delete().eq('conversations_id', id).eq('user_id', req.user.id).select('conversations_id'));
    if (!deleted?.length) throw httpError(404, 'Conversation not found.');
    res.set('Cache-Control', 'no-store').json({ success: true });
  });
  return router;
}
