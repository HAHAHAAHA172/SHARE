import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createUpload, validateUploadedFile, removeUpload } from '../../src/security/server/uploads.js';
import { text, httpError } from '../../src/security/server/validation.js';

const subjects = new Set(['DSA', 'OOP', 'Discrete Math', 'OS', 'Syllabi', 'General']);
const columns = 'id,user_id,title,content,subject,author,post_type,post_status,created_at,updated_at,likes(count),comments(count),materials(material_id,post_id,user_id,file_name,storage_path,mime_type,file_size_bytes)';
const isUuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const validId = value => { if (!isUuid(value)) throw httpError(400, 'Invalid resource ID.'); return value; };
const MAX_CONTEXT_TEXT = 120000;

async function extractPdfText(buffer) {
  const document = await getDocument({ data: buffer, isEvalSupported: false, useSystemFonts: false }).promise;
  const chunks = [];
  let total = 0;
  try {
    for (let pageNumber = 1; pageNumber <= Math.min(document.numPages, 30) && total < MAX_CONTEXT_TEXT; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items.map(item => typeof item.str === 'string' ? item.str : '').join(' ').replace(/\s+/g, ' ').trim();
      if (text) { chunks.push(`Page ${pageNumber}: ${text}`); total += text.length; }
      page.cleanup();
    }
  } finally { await document.destroy(); }
  return chunks.join('\n').slice(0, MAX_CONTEXT_TEXT);
}

function check(result) {
  if (result.error) {
    if (result.error.code === '23503') throw httpError(409, 'Your account profile is not ready for posting. Please contact support.');
    if (result.error.code === '42501') throw httpError(403, 'You do not have permission to complete this action.');
    throw httpError(503, 'Resource storage is temporarily unavailable.');
  }
  return result.data;
}

export function mapSupabasePost(row) {
  let description = row.content || '', subject = subjects.has(row.subject) ? row.subject : 'General', author = typeof row.author === 'string' ? row.author.slice(0, 80) : 'Student';
  try {
    const content = JSON.parse(description);
    if (content?.format === 'share-post-v1' && typeof content.description === 'string') {
      description = content.description;
      if (!row.subject && subjects.has(content.subject)) subject = content.subject;
      if (!row.author && typeof content.author === 'string') author = content.author.slice(0, 80);
    }
  } catch { /* Existing posts can contain ordinary text. */ }
  const material = row.materials?.[0];
  return {
    id: row.id, ownerId: row.user_id, title: row.title, description, subject, author,
    createdAt: row.created_at, likes: Number.isFinite(row.likes) ? row.likes : (row.likes?.[0]?.count || 0), commentCount: Number.isFinite(row.commentCount) ? row.commentCount : (row.comments?.[0]?.count || 0), liked: Boolean(row.liked),
    file: material ? { filename: material.material_id, originalname: material.file_name, mimetype: material.mime_type,
      size: Number(material.file_size_bytes), url: `/api/posts/${row.id}/file` } : null,
  };
}

export function createSupabasePostsRouter({ createDataClient, uploadsDir, storageBucket = 'post-files', downloadLimit = (_req, _res, next) => next(), approvalRequired = false }) {
  const router = Router();
  const upload = createUpload(uploadsDir, { kind: 'resource' });
  const clientFor = req => {
    const token = req.user ? req.get('Authorization')?.slice(7) : undefined;
    const client = createDataClient(token);
    if (!client) throw httpError(503, 'Resource storage is temporarily unavailable.');
    return client;
  };

  router.get('/', async (req, res) => {
    const query = text(req.query.q, { name: 'Search', max: 200 }).toLowerCase();
    const subject = text(req.query.subject, { name: 'Subject', max: 40, fallback: 'all' }).toLowerCase();
    const client = clientFor(req);
    const rows = check(await client.from('posts').select(columns).eq('post_status', 'published').order('created_at', { ascending: false }).limit(2000));
    const [allLikes, allComments] = await Promise.all([
      client.from('likes').select('post_id,user_id').limit(10000),
      client.from('comments').select('post_id').eq('status', 'published').limit(10000),
    ]);
    const likes = check(allLikes);
    const comments = check(allComments);
    const likeCounts = new Map();
    const commentCounts = new Map();
    likes.forEach(like => likeCounts.set(like.post_id, (likeCounts.get(like.post_id) || 0) + 1));
    comments.forEach(comment => commentCounts.set(comment.post_id, (commentCounts.get(comment.post_id) || 0) + 1));
    const ownLikes = req.user ? likes.filter(like => like.user_id === req.user.id) : [];
    const likedIds = new Set(ownLikes.map(like => like.post_id));
    let posts = rows.map(row => mapSupabasePost({ ...row, liked: likedIds.has(row.id), likes: likeCounts.get(row.id) || 0, commentCount: commentCounts.get(row.id) || 0 }));
    if (subject !== 'all') posts = posts.filter(post => post.subject.toLowerCase() === subject);
    if (query) posts = posts.filter(post => [post.title, post.description, post.author, post.subject].some(value => value.toLowerCase().includes(query)));
    res.set('Cache-Control', 'no-store').json({ success: true, count: posts.length, posts });
  });

  router.get('/:id/file', downloadLimit, async (req, res) => {
    const id = validId(req.params.id);
    const client = clientFor(req);
    const row = check(await client.from('posts').select(columns).eq('id', id).eq('post_status', 'published').maybeSingle());
    const material = row?.materials?.[0];
    if (!material || !material.storage_path.startsWith(`${row.user_id}/${id}/`)) throw httpError(404, 'Attachment not found.');
    const storage = client.storage.from(storageBucket);
    if (typeof storage.download !== 'function') {
      const signed = check(await storage.createSignedUrl(material.storage_path, 60, { download: material.file_name }));
      return res.set('Cache-Control', 'no-store').redirect(302, signed.signedUrl);
    }
    const downloaded = check(await storage.download(material.storage_path));
    const buffer = Buffer.from(await downloaded.arrayBuffer());
    res.set({
      'Cache-Control': 'private, no-store',
      'Content-Type': material.mime_type || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${String(material.file_name).replace(/["\\\r\n]/g, '_')}"`,
      'Content-Length': String(buffer.length),
    }).send(buffer);
  });

  router.get('/:id/context', async (req, res) => {
    if (!req.user) throw httpError(401, 'Sign in to access attachment context.');
    const id = validId(req.params.id);
    const client = clientFor(req);
    const row = check(await client.from('posts').select('id,user_id,title,content,subject,author,post_status,materials(file_name,mime_type,file_size_bytes,storage_path)').eq('id', id).eq('post_status', 'published').maybeSingle());
    if (!row) throw httpError(404, 'Resource not found.');
    const material = row.materials?.[0];
    let extractedText = '';
    let extractionStatus = material ? 'unsupported' : null;
    if (material?.storage_path.startsWith(`${row.user_id}/${id}/`) && material.file_size_bytes <= 10 * 1024 * 1024) {
      const downloaded = check(await client.storage.from(storageBucket).download(material.storage_path));
      const buffer = Buffer.from(await downloaded.arrayBuffer());
      if (material.mime_type === 'text/plain') {
        extractedText = buffer.toString('utf8').slice(0, MAX_CONTEXT_TEXT);
        extractionStatus = extractedText ? 'complete' : 'empty';
      } else if (material.mime_type === 'application/pdf') {
        try {
          extractedText = await extractPdfText(buffer);
          extractionStatus = extractedText ? 'complete' : 'empty';
        } catch { extractionStatus = 'pdf-extraction-failed'; }
      }
    }
    res.set('Cache-Control', 'no-store').json({
      post: { id: row.id, title: row.title, description: row.content || '', subject: row.subject || 'General', author: row.author || 'Student' },
      attachment: material ? { filename: material.file_name, mimeType: material.mime_type, size: Number(material.file_size_bytes), extractedText, extractionStatus } : null,
    });
  });

  router.get('/:id', async (req, res) => {
    const id = validId(req.params.id);
    const row = check(await clientFor(req).from('posts').select(columns).eq('id', id).eq('post_status', 'published').maybeSingle());
    if (!row) throw httpError(404, 'Resource not found.');
    res.set('Cache-Control', 'no-store').json({ success: true, post: mapSupabasePost(row) });
  });

  router.post('/', upload.single('file'), async (req, res, next) => {
    let client, storagePath, postId, postSaved = false, materialSaved = false;
    try {
      const title = text(req.body.title, { name: 'Title', max: 200, required: true });
      const description = text(req.body.description, { name: 'Description', max: 8000 });
      const subject = text(req.body.subject, { name: 'Subject', max: 40, fallback: 'General' });
      if (!subjects.has(subject)) throw httpError(400, 'Choose a supported subject.');
      await validateUploadedFile(req.file, { kind: 'resource' });
      client = clientFor(req);
      const profile = check(await client.from('user_profile').select('user_id').eq('user_id', req.user.id).maybeSingle());
      if (!profile) throw httpError(409, 'Your account profile is not ready for posting. Please contact support.');
      const count = await client.from('posts').select('id', { count: 'exact', head: true }).eq('user_id', req.user.id);
      check(count);
      if (count.count >= 100) throw httpError(429, 'The resource limit has been reached. Remove an older resource before posting again.');
      const total = await client.from('posts').select('id', { count: 'exact', head: true });
      check(total);
      if (total.count >= 2000) throw httpError(429, 'The resource limit has been reached. Remove an older resource before posting again.');
      const displayName = req.user.user_metadata?.display_name;
      const author = text(typeof displayName === 'string' ? displayName.slice(0, 80) : undefined, { max: 80, fallback: 'Student' });
      const now = new Date().toISOString();
      postId = randomUUID();
      const row = { id: postId, user_id: req.user.id, title, content: description, subject, author,
        post_type: 'discussion', post_status: approvalRequired ? 'pending' : 'published', created_at: now, updated_at: now };
      let material;
      if (req.file) {
        storagePath = `${req.user.id}/${postId}/${randomUUID()}${path.extname(req.file.filename)}`;
        check(await client.storage.from(storageBucket).upload(storagePath, await readFile(req.file.path), { contentType: req.file.mimetype, upsert: false }));
        material = { material_id: randomUUID(), post_id: postId, user_id: req.user.id,
          file_name: text(req.file.originalname, { name: 'Filename', max: 180, required: true }),
          storage_path: storagePath, mime_type: req.file.mimetype, file_size_bytes: req.file.size, created_at: now };
      }
      check(await client.from('posts').insert(row));
      postSaved = true;
      if (material) { check(await client.from('materials').insert(material)); materialSaved = true; }
      res.status(201).json({ success: true, post: mapSupabasePost({ ...row, materials: material ? [material] : [] }) });
    } catch (error) {
      // Compensate failed multi-service writes. Never silently fall back to Render disk.
      if (client && postId) {
        if (materialSaved) await client.from('materials').delete().eq('post_id', postId).eq('user_id', req.user.id).then(() => {}, () => {});
        if (postSaved) await client.from('posts').delete().eq('id', postId).eq('user_id', req.user.id).then(() => {}, () => {});
        if (storagePath) await client.storage.from(storageBucket).remove([storagePath]).catch(() => {});
      }
      next(error);
    } finally { await removeUpload(req.file); }
  });

  router.delete('/:id', async (req, res) => {
    const id = validId(req.params.id);
    const client = clientFor(req);
    const row = check(await client.from('posts').select(columns).eq('id', id).maybeSingle());
    if (!row) throw httpError(404, 'Resource not found.');
    if (row.user_id !== req.user.id) throw httpError(403, 'You can only delete resources you shared.');
    // Existing materials.post_id is NOT NULL with ON DELETE SET NULL. Remove
    // children explicitly before the parent, rather than depending on that FK.
    const paths = (row.materials || []).map(file => file.storage_path);
    if (paths.some(value => !value.startsWith(`${req.user.id}/${id}/`))) throw httpError(409, 'This resource requires administrator cleanup.');
    if (paths.length) check(await client.storage.from(storageBucket).remove(paths));
    check(await client.from('materials').delete().eq('post_id', id).eq('user_id', req.user.id));
    const deleted = check(await client.from('posts').delete().eq('id', id).eq('user_id', req.user.id).select('id'));
    if (!deleted?.length) throw httpError(403, 'The resource could not be deleted.');
    res.json({ success: true, message: 'Resource deleted.' });
  });
  return router;
}
