import { Router } from 'express';
import { readFile, unlink } from 'node:fs/promises';
import { createUserContent, createPartFromUri } from '@google/genai';
import { validateQuizStructure } from '../../shared/quiz.js';
import { createUpload, validateUploadedFile } from '../../src/security/server/uploads.js';
import { MAX_RESPONSE_BYTES, createRequestContext, requestError, validateChat, validateQuizRequest, writeEvent } from '../../src/security/server/ai.js';

const SYSTEM_INSTRUCTION = 'You are P.E.D.R.O (Pedagogical Educational Drill & Review Organizer), an AI study assistant for the S.H.A.R.E. academic platform. Help students understand concepts with accurate explanations and useful study guidance. Use clear markdown and a friendly tone. Avoid repeating introductions during ongoing conversations.';
const MAX_INLINE_DOCUMENT_BYTES = 120 * 1024;

function quizPrompt({ items, parts, partTypes, topic, instructions, fromFile }) {
  return `${fromFile ? 'Based on the attached document, generate an academic quiz.' : `Generate an academic quiz about ${JSON.stringify(topic)}.`}
Specific instructions: ${instructions}
The quiz must have exactly ${parts} parts and a total of ${items} items distributed across them.
${partTypes.map((type, index) => `Part ${index + 1} must be strictly type: ${type}.`).join('\n')}
For multiple choice and true or false questions, include an options array of strings. Omit options for enumeration questions.
Return only a JSON object with this structure: {"title":"Quiz Title","parts":[{"partTitle":"Part 1","questions":[{"question":"Question text","options":["Choice A","Choice B"],"answer":"Correct Answer"}]}]}.
Use at most 1000 characters for titles, answers, and each option, at most 4000 characters per question, and at most 10 options per question.`;
}

function parseQuizResponse(output) {
  if (typeof output !== 'string' || Buffer.byteLength(output, 'utf8') > MAX_RESPONSE_BYTES) {
    throw requestError(502, 'The AI returned an invalid quiz response.');
  }
  const cleaned = output.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return validateQuizStructure(JSON.parse(cleaned));
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return validateQuizStructure(JSON.parse(cleaned.slice(start, end + 1)));
      } catch {
        // Fall through to the same public error without exposing provider output.
      }
    }
    throw requestError(502, 'The AI returned quiz data in an invalid format.');
  }
}

function sendError(res, error) {
  if (res.destroyed || res.writableEnded) return;
  const status = [400, 413, 429, 503, 504].includes(error?.status) ? error.status : 502;
  const messages = {
    400: 'Invalid request or attachment.', 413: 'The request exceeds the permitted size.',
    429: 'Too many AI requests. Please try again later.', 503: 'The AI service is unavailable.',
    504: 'The AI request timed out. Please try again.',
  };
  const message = error.publicError ? error.message : messages[status] || 'The AI service could not complete the request. Please try again.';
  if (res.headersSent) {
    res.end(`data: ${JSON.stringify({ error: message })}\n\n`);
  } else {
    res.removeHeader('Content-Type');
    res.removeHeader('Cache-Control');
    res.removeHeader('Connection');
    res.status(status).json({ error: message });
  }
}

async function deleteProviderFile(ai, file) {
  if (!file?.name || !ai.files?.delete) return;
  const controller = new AbortController();
  let timer;
  try {
    await Promise.race([
      Promise.resolve().then(() => ai.files.delete({ name: file.name, config: { abortSignal: controller.signal, httpOptions: { timeout: 5000 } } })),
      new Promise(resolve => { timer = setTimeout(() => { controller.abort(); resolve(); }, 5000); timer.unref?.(); }),
    ]);
  } catch { /* Cleanup must not expose provider details or replace the request result. */ }
  finally { clearTimeout(timer); }
}

export function createChatbotRouter({ ai, uploadsDir, aiTimeoutMs = 45000, maxOutputTokens = 4096 }) {
  const router = Router();
  const upload = createUpload(uploadsDir, { kind: 'ai' });
  router.use(['/chat', '/quiz/generate', '/quiz/generate-from-file'], (_req, res, next) => {
    if (!ai) return res.status(503).json({ error: 'P.E.D.R.O is temporarily unavailable. Please try again later.' });
    next();
  });

  function route(handler, field) {
    return async (req, res) => {
      let context;
      let uploadedFile;
      try {
        if (field) {
          await new Promise((resolve, reject) => upload.single(field)(req, res, error => error ? reject(error) : resolve()));
        }
        context = createRequestContext(req, res, aiTimeoutMs);
        if (context.signal.aborted) throw context.signal.reason;
        if (req.file) await context.wait(validateUploadedFile(req.file, { kind: 'ai' }));
        const config = { maxOutputTokens, abortSignal: context.signal, httpOptions: { timeout: aiTimeoutMs } };
        const uploadFile = async () => {
          const pending = Promise.resolve().then(() => ai.files.upload({ file: req.file.path, config: { mimeType: req.file.mimetype } }));
          // A provider may finish an upload after cancellation; delete that late result too.
          pending.then(file => {
            if (context.signal.aborted) void deleteProviderFile(ai, file);
            else uploadedFile = file;
          }, () => {});
          const file = await context.wait(pending);
          uploadedFile = file;
          if (!file?.name || !file?.uri || !file?.mimeType) throw requestError(502, 'Invalid attachment response.');
          return createPartFromUri(file.uri, file.mimeType);
        };
        await handler(req, res, { context, config, uploadFile });
      } catch (error) {
        let responseError = error;
        // Keep provider diagnostics in Render logs without exposing secrets,
        // prompts, attachment contents, or full provider response bodies.
        console.error('[chatbot] request failed', {
          status: error?.status,
          code: error?.code,
          name: error?.name,
          message: typeof error?.message === 'string' ? error.message.slice(0, 300) : undefined,
        });
        if (error?.code?.startsWith('LIMIT_')) {
          responseError = requestError(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400, error.code === 'LIMIT_FILE_SIZE' ? 'The attachment exceeds the 10 MB limit.' : 'The upload exceeds the allowed file or field limits.');
        }
        context?.cancel(responseError);
        sendError(res, responseError);
      } finally {
        context?.dispose();
        if (req.file?.path) await unlink(req.file.path).catch(() => {});
        await deleteProviderFile(ai, uploadedFile);
      }
    };
  }

  router.post('/chat', route(async (req, res, { context, config, uploadFile }) => {
    const { message, history } = validateChat(req.body, Boolean(req.file));
    const filePart = req.file ? await uploadFile() : null;
    const chat = ai.chats.create({ model: process.env.GEMINI_MODEL || 'gemini-3.8-flash', history, config: { ...config, systemInstruction: SYSTEM_INSTRUCTION } });
    const stream = await context.wait(chat.sendMessageStream({
      message: filePart ? createUserContent([filePart, message || 'Please analyze this attached document.']) : message,
    }));
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    const iterator = stream[Symbol.asyncIterator]();
    let bytes = 0;
    try {
      while (true) {
        const { done, value } = await context.wait(iterator.next());
        if (done) break;
        const chunk = value.text;
        if (chunk) {
          if (typeof chunk !== 'string') throw requestError(502, 'Invalid AI response.');
          bytes += Buffer.byteLength(`data: ${JSON.stringify({ text: chunk })}\n\n`, 'utf8');
          // Reserve room for the completion marker or one final SSE error.
          if (bytes > MAX_RESPONSE_BYTES - 512) throw requestError(502, 'AI response exceeds the permitted size.');
          await writeEvent(res, { text: chunk }, context);
        }
      }
      await writeEvent(res, '[DONE]', context);
      res.end();
    } finally {
      // Do not await a stuck provider iterator during cancellation.
      if (typeof iterator.return === 'function') Promise.resolve(iterator.return()).catch(() => {});
    }
  }, 'file'));

  async function generateQuiz(req, res, { context, config, uploadFile }, fromFile) {
    if (fromFile && !req.file) throw requestError(400, 'Attach a document to generate a quiz.');
    const settings = validateQuizRequest(req.body, fromFile);
    let prompt = quizPrompt(settings);
    let contents = prompt;
    if (fromFile) {
      if (req.file.mimetype === 'text/plain') {
        const document = await context.wait(readFile(req.file.path, 'utf8'));
        const boundedDocument = document.slice(0, MAX_INLINE_DOCUMENT_BYTES);
        prompt = `${prompt}\n\nDocument text${document.length > MAX_INLINE_DOCUMENT_BYTES ? ' (truncated)' : ''}:\n${boundedDocument}`;
        contents = createUserContent([prompt]);
      } else {
        contents = createUserContent([await uploadFile(), prompt]);
      }
    }
    const response = await context.wait(ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite', contents,
      config: { ...config, responseMimeType: 'application/json' },
    }));
    const quiz = parseQuizResponse(response.text);
    if (quiz.parts.length !== settings.parts || quiz.parts.reduce((count, part) => count + part.questions.length, 0) !== settings.items) {
      throw requestError(502, 'The generated quiz does not match the requested size.');
    }
    res.json(quiz);
  }
  router.post('/quiz/generate', route((req, res, options) => generateQuiz(req, res, options, false)));
  router.post('/quiz/generate-from-file', route((req, res, options) => generateQuiz(req, res, options, true), 'document'));
  return router;
}
