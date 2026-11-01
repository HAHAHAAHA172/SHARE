import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readChatStream } from './chatStream.js';

function responseFromChunks(chunks) {
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    }
  }));
}

test('preserves fragmented events, CRLF, unicode, and ignores data after DONE', async () => {
  const bytes = new TextEncoder().encode(': ping\r\n\r\ndata: {"text":"π 🧠"}\r\n\r\ndata:{"text":" study"}\n\ndata: [DONE]\n\ndata: {"text":"unexpected"}\n\n');
  let text = '';
  await readChatStream(responseFromChunks([...bytes].map(byte => Uint8Array.of(byte))), chunk => { text += chunk; });
  assert.equal(text, 'π 🧠 study');
});

test('dispatches final event without trailing newline', async () => {
  let text = '';
  await readChatStream(responseFromChunks([new TextEncoder().encode('data: {"text":"last"}')]), chunk => { text += chunk; });
  assert.equal(text, 'last');
});

test('surfaces server errors and malformed events instead of silently dropping them', async () => {
  for (const [body, expected] of [['data: {"error":"Service busy"}\n\n', /Service busy/], ['data: {broken}\n\n', /unreadable/]]) {
    await assert.rejects(readChatStream(responseFromChunks([new TextEncoder().encode(body)]), () => {}), expected);
  }
  await assert.rejects(readChatStream(new Response('failure', { status: 503 }), () => {}), /503/);
  await assert.rejects(readChatStream(new Response('data: [DONE]\n\n'), () => {}), /empty response/);
});

test('surfaces the setup message from an unsuccessful JSON response', async () => {
  const response = new Response(JSON.stringify({ error: 'Configure the API key to enable PEDRO.' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' }
  });
  await assert.rejects(readChatStream(response, () => {}), /Configure the API key to enable PEDRO\./);
});
