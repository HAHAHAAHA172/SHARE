// Buffer complete SSE events before parsing: network chunks can split anywhere.
export async function readChatStream(response, onText) {
  if (!response.ok) {
    let message = `PEDRO request failed (${response.status}). Please try again.`;
    try {
      const body = await response.json();
      if (typeof body.error === 'string' && body.error.trim()) message = body.error;
    } catch { /* Preserve the HTTP error if the server returned a non-JSON body. */ }
    throw new Error(message);
  }
  if (!response.body) throw new Error('PEDRO returned an empty response. Please try again.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let complete = false;
  let receivedText = false;
  const dispatch = (event) => {
    const data = event.split(/\r?\n/)
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).replace(/^ /, '')).join('\n');
    if (!data) return;
    if (data.trim() === '[DONE]') { complete = true; return; }
    let parsed;
    try { parsed = JSON.parse(data); }
    catch { throw new Error('PEDRO returned an unreadable response. Please try again.'); }
    if (parsed.error) throw new Error(String(parsed.error));
    if (typeof parsed.text === 'string' && parsed.text.length) {
      receivedText = true;
      onText(parsed.text);
    }
  };
  try {
    while (!complete) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let boundary;
      while (!complete && (boundary = /\r?\n\r?\n/.exec(buffer))) {
        dispatch(buffer.slice(0, boundary.index));
        buffer = buffer.slice(boundary.index + boundary[0].length);
      }
      if (done) {
        if (!complete && buffer.trim()) dispatch(buffer);
        break;
      }
    }
    if (!receivedText) throw new Error('PEDRO returned an empty response. Please try again.');
  } finally {
    try { await reader.cancel(); } finally { reader.releaseLock(); }
  }
}
