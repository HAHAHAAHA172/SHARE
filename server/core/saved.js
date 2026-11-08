import { Router } from 'express';
import { httpError } from '../../src/security/server/validation.js';
import { mapSupabasePost, POST_COLUMNS } from './supabasePosts.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function check(result) {
  if (result.error) {
    if (result.error.code === '42P01') throw httpError(503, 'Saved posts are not configured yet.');
    if (result.error.code === '42501') throw httpError(403, 'You do not have permission to update saved posts.');
    throw httpError(503, 'Saved posts are temporarily unavailable.');
  }
  return result.data;
}

export function createSavedRouter({ createDataClient }) {
  const router = Router();
  const clientFor = req => {
    const token = req.get('Authorization')?.slice(7);
    const client = createDataClient(token);
    if (!client) throw httpError(503, 'Database access is temporarily unavailable.');
    return client;
  };

  router.get('/', async (req, res, next) => {
    try {
      const client = clientFor(req);
      const saved = check(await client.from('saved_posts').select('post_id,created_at').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(500));
      const ids = saved.map(item => item.post_id);
      if (!ids.length) return res.set('Cache-Control', 'no-store').json({ posts: [] });
      const rows = check(await client.from('posts').select(POST_COLUMNS).in('id', ids).eq('post_status', 'published'));
      const byId = new Map(rows.map(row => [row.id, mapSupabasePost(row)]));
      const posts = ids.map(id => byId.get(id)).filter(Boolean);
      res.set('Cache-Control', 'no-store').json({ posts });
    } catch (error) { next(error); }
  });

  router.put('/:postId', async (req, res, next) => {
    try {
      if (!uuidPattern.test(req.params.postId)) throw httpError(400, 'Invalid post ID.');
      const client = clientFor(req);
      check(await client.from('saved_posts').upsert({ user_id: req.user.id, post_id: req.params.postId }, { onConflict: 'user_id,post_id', ignoreDuplicates: true }));
      res.status(201).json({ success: true });
    } catch (error) { next(error); }
  });

  router.delete('/:postId', async (req, res, next) => {
    try {
      if (!uuidPattern.test(req.params.postId)) throw httpError(400, 'Invalid post ID.');
      const client = clientFor(req);
      check(await client.from('saved_posts').delete().eq('user_id', req.user.id).eq('post_id', req.params.postId));
      res.json({ success: true });
    } catch (error) { next(error); }
  });

  return router;
}
