import { Router } from 'express';
import path from 'node:path';
import { readFileSync, writeFileSync, renameSync, existsSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createUpload, validateUploadedFile, removeUpload } from '../../src/security/server/uploads.js';
import { text, httpError } from '../../src/security/server/validation.js';

const subjects = new Set(['DSA', 'OOP', 'Discrete Math', 'OS', 'Syllabi', 'General']);
const readPosts = file => existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
function validId(value) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw httpError(400, 'Invalid resource ID.');
  return value;
}

export function createResourceDownload({ dataDir, uploadsDir }) {
  const postsFile = path.join(dataDir, 'posts.json');
  return (req, res, next) => {
    const filename = req.params.filename;
    if (filename !== path.basename(filename) || filename.length > 160) return next(httpError(404, 'Attachment not found.'));
    const post = readPosts(postsFile).find(post => post.file?.filename === filename);
    if (!post) return next(httpError(404, 'Attachment not found.'));
    const file = path.join(uploadsDir, filename);
    if (!existsSync(file)) return next(httpError(404, 'Attachment not found.'));
    // Only explicitly shared resource attachments are downloadable. Never serve a whole directory.
    res.set({ 'Content-Type': 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=0' });
    res.download(file, text(post.file.originalname, { max: 180, fallback: 'resource' }), { dotfiles: 'deny' }, error => { if (error) next(error); });
  };
}

export function createPostsRouter({ dataDir, uploadsDir }) {
  const router = Router();
  const postsFile = path.join(dataDir, 'posts.json');
  const savePosts = posts => {
    const temporaryFile = `${postsFile}.tmp`;
    writeFileSync(temporaryFile, JSON.stringify(posts, null, 2));
    renameSync(temporaryFile, postsFile);
  };
  const upload = createUpload(uploadsDir, { kind: 'resource' });

  router.get('/', (req, res) => {
    let posts = readPosts(postsFile);
    const query = text(req.query.q, { name: 'Search', max: 200 }).toLowerCase();
    const subject = text(req.query.subject, { name: 'Subject', max: 40, fallback: 'all' }).toLowerCase();
    if (subject !== 'all') posts = posts.filter(post => post.subject?.toLowerCase() === subject);
    if (query) posts = posts.filter(post => [post.title, post.description, post.author, post.subject].some(value => typeof value === 'string' && value.toLowerCase().includes(query)));
    res.json({ success: true, count: posts.length, posts });
  });

  router.get('/:id', (req, res) => {
    const id = validId(req.params.id);
    const post = readPosts(postsFile).find(post => post.id === id);
    if (!post) return res.status(404).json({ error: 'Resource not found.' });
    res.json({ success: true, post });
  });

  router.post('/', upload.single('file'), async (req, res, next) => {
    try {
      const title = text(req.body.title, { name: 'Title', max: 200, required: true });
      const description = text(req.body.description, { name: 'Description', max: 8000 });
      const subject = text(req.body.subject, { name: 'Subject', max: 40, fallback: 'General' });
      if (!subjects.has(subject)) throw httpError(400, 'Choose a supported subject.');
      await validateUploadedFile(req.file, { kind: 'resource' });
      const posts = readPosts(postsFile);
      if (posts.length >= 2000 || posts.filter(post => post.ownerId === req.user.id).length >= 100) throw httpError(429, 'The resource limit has been reached. Remove an older resource before posting again.');
      const storedBytes = posts.reduce((total, post) => total + (Number(post.file?.size) || 0), 0);
      if (storedBytes + (req.file?.size || 0) > 250 * 1024 * 1024) throw httpError(503, 'Resource storage is full. Please try again later.');
      const displayName = req.user.user_metadata?.display_name;
      const author = text(typeof displayName === 'string' ? displayName.slice(0, 80) : undefined, { name: 'Profile name', max: 80, fallback: 'Student' });
      const post = {
        id: `post-${randomUUID()}`, title, description, subject, author,
        ownerId: req.user.id, createdAt: new Date().toISOString(), likes: 0,
        file: req.file ? {
          filename: req.file.filename, originalname: text(req.file.originalname, { name: 'Filename', max: 180, required: true }),
          mimetype: req.file.mimetype, size: req.file.size, url: `/uploads/${req.file.filename}`,
        } : null,
      };
      savePosts([post, ...posts]);
      res.status(201).json({ success: true, post });
    } catch (error) { await removeUpload(req.file); next(error); }
  });

  router.delete('/:id', (req, res) => {
    const id = validId(req.params.id);
    const posts = readPosts(postsFile);
    const post = posts.find(post => post.id === id);
    if (!post) return res.status(404).json({ error: 'Resource not found.' });
    if (!post.ownerId || post.ownerId !== req.user.id) throw httpError(403, 'You can only delete resources you shared.');
    savePosts(posts.filter(post => post.id !== id));
    // Orphan files cannot be downloaded: downloads require a matching saved resource.
    if (post.file?.filename) {
      const file = path.join(uploadsDir, path.basename(post.file.filename));
      try { if (existsSync(file)) unlinkSync(file); } catch { /* Storage cleanup can be retried without exposing the file. */ }
    }
    res.json({ success: true, message: 'Resource deleted.' });
  });
  return router;
}
