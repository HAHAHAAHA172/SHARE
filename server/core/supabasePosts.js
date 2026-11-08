import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createUpload, validateUploadedFile, removeUpload } from '../../src/security/server/uploads.js';
import { text, httpError } from '../../src/security/server/validation.js';

const subjects = new Set(['DSA', 'OOP', 'Discrete Math', 'OS', 'Syllabi', 'General']);
export const POST_COLUMNS = 'id,user_id,title,content,subject,author,post_type,post_status,created_at,updated_at,likes(count),comments(count),materials(material_id,post_id,user_id,file_name,storage_path,mime_type,file_size_bytes)';
const columns = POST_COLUMNS;
const isUuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const validId = value => { if (!isUuid(value)) throw httpError(400, 'Invalid resource ID.'); return value; };
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
  const materials = Array.isArray(row.materials) ? row.materials : [];
  const files = materials.map((material, index) => ({ filename: material.material_id, originalname: material.file_name, mimetype: material.mime_type,
    size: Number(material.file_size_bytes), url: index === 0 ? `/api/posts/${row.id}/file` : `/api/posts/${row.id}/file?material=${encodeURIComponent(material.material_id)}` }));
  return {
    id: row.id, ownerId: row.user_id, title: row.title, description, subject, author,
    createdAt: row.created_at, likes: Number.isFinite(row.likes) ? row.likes : (row.likes?.[0]?.count || 0), commentCount: Number.isFinite(row.commentCount) ? row.commentCount : (row.comments?.[0]?.count || 0), liked: Boolean(row.liked),
    file: files[0] || null, files,
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
    const ownLikes = req.user && rows.length
      ? check(await client.from('likes').select('post_id').eq('user_id', req.user.id).in('post_id', rows.map(row => row.id)))
      : [];
    const likedIds = new Set(ownLikes.map(like => like.post_id));
    let posts = rows.map(row => mapSupabasePost({ ...row, liked: likedIds.has(row.id) }));
    if (subject !== 'all') posts = posts.filter(post => post.subject.toLowerCase() === subject);
    if (query) posts = posts.filter(post => [post.title, post.description, post.author, post.subject].some(value => value.toLowerCase().includes(query)));
    res.set('Cache-Control', 'no-store').json({ success: true, count: posts.length, posts });
  });

  router.get('/:id/file', downloadLimit, async (req, res) => {
    const id = validId(req.params.id);
    const client = clientFor(req);
    const row = check(await client.from('posts').select(columns).eq('id', id).eq('post_status', 'published').maybeSingle());
    const requestedMaterial = typeof req.query.material === 'string' ? req.query.material : '';
    const material = requestedMaterial ? row?.materials?.find(item => item.material_id === requestedMaterial) : row?.materials?.[0];
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

  router.get('/:id', async (req, res) => {
    const id = validId(req.params.id);
    const row = check(await clientFor(req).from('posts').select(columns).eq('id', id).eq('post_status', 'published').maybeSingle());
    if (!row) throw httpError(404, 'Resource not found.');
    res.set('Cache-Control', 'no-store').json({ success: true, post: mapSupabasePost(row) });
  });

  router.post('/', upload.fields([{ name: 'files', maxCount: 4 }, { name: 'file', maxCount: 1 }]), async (req, res, next) => {
    const uploadedFiles = [...(req.files?.files || []), ...(req.files?.file || [])].slice(0, 4);
    let client, postId, postSaved = false, materialSaved = false;
    const storagePaths = [];
    try {
      const title = text(req.body.title, { name: 'Title', max: 200, required: true });
      const description = text(req.body.description, { name: 'Description', max: 8000 });
      const subject = text(req.body.subject, { name: 'Subject', max: 40, fallback: 'General' });
      if (!subjects.has(subject)) throw httpError(400, 'Choose a supported subject.');
      await Promise.all(uploadedFiles.map(file => validateUploadedFile(file, { kind: 'resource' })));
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
      const materials = [];
      for (const file of uploadedFiles) {
        const storagePath = `${req.user.id}/${postId}/${randomUUID()}${path.extname(file.filename)}`;
        check(await client.storage.from(storageBucket).upload(storagePath, await readFile(file.path), { contentType: file.mimetype, upsert: false }));
        storagePaths.push(storagePath);
        materials.push({ material_id: randomUUID(), post_id: postId, user_id: req.user.id,
          file_name: text(file.originalname, { name: 'Filename', max: 180, required: true }),
          storage_path: storagePath, mime_type: file.mimetype, file_size_bytes: file.size, created_at: now });
      }
      check(await client.from('posts').insert(row));
      postSaved = true;
      if (materials.length) { check(await client.from('materials').insert(materials.length === 1 ? materials[0] : materials)); materialSaved = true; }
      res.status(201).json({ success: true, post: mapSupabasePost({ ...row, materials }) });
    } catch (error) {
      // Compensate failed multi-service writes. Never silently fall back to Render disk.
      if (client && postId) {
        if (materialSaved) await client.from('materials').delete().eq('post_id', postId).eq('user_id', req.user.id).then(() => {}, () => {});
        if (postSaved) await client.from('posts').delete().eq('id', postId).eq('user_id', req.user.id).then(() => {}, () => {});
        if (storagePaths.length) await client.storage.from(storageBucket).remove(storagePaths).catch(() => {});
      }
      next(error);
    } finally { await Promise.all(uploadedFiles.map(removeUpload)); }
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
