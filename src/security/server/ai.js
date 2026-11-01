export const MAX_RESPONSE_BYTES = 256 * 1024;
const PART_TYPES = new Set(['multiple choice', 'true or false', 'enumeration']);

export function requestError(status, message) {
  return Object.assign(new Error(message), { status, publicError: true });
}

function text(value, name, limit, fallback = '') {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || value.length > limit) {
    throw requestError(400, `${name} must be a string of at most ${limit} characters.`);
  }
  return value.trim();
}

function parse(value, name) {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); }
  catch { throw requestError(400, `${name} must contain valid JSON.`); }
}

export function validateChat(body, hasFile) {
  const message = text(body?.message, 'Message', 8000);
  if (!message && !hasFile) throw requestError(400, 'Provide a message or an attachment.');
  const history = parse(body?.history ?? [], 'History');
  if (!Array.isArray(history) || history.length > 12) throw requestError(400, 'History must contain at most 12 messages.');
  let total = 0;
  const cleaned = history.map(item => {
    if (!item || !['user', 'bot'].includes(item.role) || typeof item.text !== 'string' || item.text.length > 8000) {
      throw requestError(400, 'History messages must have a user or bot role and text of at most 8000 characters.');
    }
    total += item.text.length;
    return { role: item.role === 'bot' ? 'model' : 'user', parts: [{ text: item.text.trim() }] };
  });
  if (total > 32000) throw requestError(400, 'History exceeds 32000 characters.');
  if (cleaned.at(-1)?.role === 'user' && cleaned.at(-1).parts[0].text === message) cleaned.pop();
  return { message, history: cleaned };
}

export function validateQuizRequest(body, fromFile = false) {
  const number = (value, name, maximum) => {
    if (typeof value === 'string' && /^\d+$/.test(value)) value = Number(value);
    if (!Number.isInteger(value) || value < 1 || value > maximum) throw requestError(400, `${name} must be an integer from 1 to ${maximum}.`);
    return value;
  };
  const items = number(body?.items, 'Items', 50);
  const parts = number(body?.parts, 'Parts', 3);
  if (parts > items) throw requestError(400, 'Parts cannot exceed items.');
  const suppliedTypes = parse(body?.partTypes, 'Part types');
  if (!suppliedTypes || typeof suppliedTypes !== 'object' || Object.keys(suppliedTypes).length > 3 ||
      Object.keys(suppliedTypes).some(key => !/^[0-2]$/.test(key)) ||
      Object.values(suppliedTypes).some(value => !PART_TYPES.has(value))) {
    throw requestError(400, 'Part types must contain only multiple choice, true or false, or enumeration.');
  }
  const partTypes = Array.from({ length: parts }, (_, index) => suppliedTypes[index]);
  if (partTypes.some(value => !PART_TYPES.has(value))) throw requestError(400, 'Choose a type for each quiz part.');
  const topic = text(body?.topic, 'Topic', 2000, 'General Studies') || 'General Studies';
  const instructions = text(body?.instructions, 'Instructions', 2000, 'General coverage') || 'General coverage';
  return { items, parts, partTypes, topic, instructions, fromFile };
}

export function createRequestContext(req, res, timeoutMs) {
  const controller = new AbortController();
  let rejectAbort;
  const aborted = new Promise((_, reject) => { rejectAbort = reject; });
  // The timer may fire between awaits, so always attach a rejection handler.
  aborted.catch(() => {});
  const abort = error => {
    if (controller.signal.aborted) return;
    controller.abort(error);
    rejectAbort(error);
  };
  const onDisconnect = () => { if (!res.writableEnded) abort(requestError(499, 'Request disconnected.')); };
  req.once('aborted', onDisconnect);
  res.once('close', onDisconnect);
  if (req.aborted || res.destroyed) onDisconnect();
  const timer = setTimeout(() => abort(requestError(504, 'The AI request timed out. Please try again.')), timeoutMs);
  timer.unref?.();
  return {
    signal: controller.signal,
    cancel: abort,
    wait: promise => Promise.race([promise, aborted]),
    dispose() {
      clearTimeout(timer);
      req.off('aborted', onDisconnect);
      res.off('close', onDisconnect);
    },
  };
}

export async function writeEvent(res, value, context) {
  if (context.signal.aborted || res.destroyed) throw requestError(499, 'Request disconnected.');
  if (res.write(`data: ${typeof value === 'string' ? value : JSON.stringify(value)}\n\n`)) return;
  let onDrain;
  try {
    await context.wait(new Promise(resolve => { onDrain = resolve; res.once('drain', onDrain); }));
  } finally {
    res.off('drain', onDrain);
  }
}
