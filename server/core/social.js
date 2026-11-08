import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { text, httpError, pageNumber } from '../../src/security/server/validation.js';

const uuid = value => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw httpError(400, 'Invalid resource ID.');
  return value;
};
function data(result) {
  if (result.error) {
    if (result.error.code === '42501') throw httpError(403, 'You do not have permission to complete this action.');
    if (result.error.code === '23503') throw httpError(409, 'Your account profile or this post is no longer available.');
    throw httpError(503, 'Discussion is temporarily unavailable. Please try again.');
  }
  return result.data;
}

export function createSocialRouter({ createDataClient, cache = null }) {
  const router = Router();
  const invalidatePosts = () => cache?.set('share:posts:version', randomUUID(), 3600);
  const clientFor = req => {
    if (!createDataClient) throw httpError(503, 'Discussion is temporarily unavailable. Please try again.');
    const client = createDataClient(req.user ? req.get('Authorization').slice(7) : undefined);
    if (!client) throw httpError(503, 'Discussion is temporarily unavailable. Please try again.');
    return client;
  };
  const publishedPost = async (client, id) => {
    const post = data(await client.from('posts').select('id').eq('id', id).eq('post_status', 'published').maybeSingle());
    if (!post) throw httpError(404, 'Resource not found.');
  };
  const actions = async (client, id, userId) => {
    const [likes, comments, own] = await Promise.all([
      client.from('likes').select('likes_id', { count: 'exact', head: true }).eq('post_id', id),
      client.from('comments').select('comment_id', { count: 'exact', head: true }).eq('post_id', id).eq('status', 'published'),
      userId ? client.from('likes').select('likes_id').eq('post_id', id).eq('user_id', userId).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    data(likes); data(comments);
    return { likes: likes.count || 0, commentCount: comments.count || 0, liked: Boolean(data(own)) };
  };
  router.get('/:id/actions', async (req, res) => {
    const id = uuid(req.params.id), client = clientFor(req);
    await publishedPost(client, id);
    res.set('Cache-Control', 'no-store').json({ success: true, ...await actions(client, id, req.user?.id) });
  });
  router.post('/:id/like', async (req, res) => {
    const id = uuid(req.params.id), client = clientFor(req);
    await publishedPost(client, id);
    data(await client.from('likes').upsert({ post_id: id, user_id: req.user.id, created_at: new Date().toISOString() }, { onConflict: 'post_id,user_id', ignoreDuplicates: true }));
    await invalidatePosts();
    res.json({ success: true, ...await actions(client, id, req.user.id) });
  });
  router.delete('/:id/like', async (req, res) => {
    const id = uuid(req.params.id), client = clientFor(req);
    await publishedPost(client, id);
    data(await client.from('likes').delete().eq('post_id', id).eq('user_id', req.user.id));
    await invalidatePosts();
    res.json({ success: true, ...await actions(client, id, req.user.id) });
  });
  router.get('/:id/comments', async (req, res) => {
    const id = uuid(req.params.id), client = clientFor(req);
    const page = pageNumber(req.query.page, 1, 10000), pageSize = 30;
    await publishedPost(client, id);
    const result = await client.from('comments').select('comment_id,user_id,content,parent_comment_id,created_at', { count: 'exact' })
      .eq('post_id', id).eq('status', 'published').order('created_at', { ascending: true }).order('comment_id', { ascending: true }).range((page - 1) * pageSize, page * pageSize - 1);
    const rows = data(result);
    // Profile RLS decides which names are visible. Never widen profile access
    // just to display a comment author; a non-visible name has a safe fallback.
    const ids = [...new Set(rows.map(row => row.user_id))];
    const profiles = ids.length ? data(await client.from('user_profile').select('user_id,full_name,user_name').in('user_id', ids)) : [];
    const names = new Map(profiles.map(profile => [profile.user_id, profile.full_name || profile.user_name || 'Student']));
    const comments = rows.map(row => ({ id: row.comment_id, ownerId: row.user_id, text: row.content, author: names.get(row.user_id) || 'Student', createdAt: row.created_at, parentId: row.parent_comment_id }));
    res.set('Cache-Control', 'no-store').json({ success: true, comments, count: result.count || 0, page, hasMore: page * pageSize < (result.count || 0) });
  });
  router.post('/:id/comments', async (req, res) => {
    const id = uuid(req.params.id), client = clientFor(req);
    const content = text(req.body.content, { name: 'Comment', max: 2000, required: true });
    await publishedPost(client, id);
    const now = new Date().toISOString();
    const row = { comment_id: randomUUID(), post_id: id, user_id: req.user.id, content, status: 'published', created_at: now, updated_at: now, parent_comment_id: null };
    data(await client.from('comments').insert(row));
    await invalidatePosts();
    const suppliedName = req.user.user_metadata?.display_name;
    const author = text(typeof suppliedName === 'string' ? suppliedName.slice(0, 80) : undefined, { max: 80, fallback: 'Student' });
    res.status(201).json({ success: true, comment: { id: row.comment_id, ownerId: row.user_id, text: content, author, createdAt: now, parentId: null } });
  });
  router.delete('/:id/comments/:commentId', async (req, res) => {
    const id = uuid(req.params.id), commentId = uuid(req.params.commentId), client = clientFor(req);
    await publishedPost(client, id);
    const comment = data(await client.from('comments').select('comment_id,user_id').eq('comment_id', commentId).eq('post_id', id).eq('status', 'published').maybeSingle());
    if (!comment) throw httpError(404, 'Comment not found.');
    if (comment.user_id !== req.user.id) throw httpError(403, 'You can only delete your own comments.');
    // Preserve possible reply references instead of relying on an unknown FK
    // deletion action. RLS hides deleted comments from all public reads.
    data(await client.from('comments').update({ status: 'deleted', updated_at: new Date().toISOString() }).eq('comment_id', commentId).eq('post_id', id).eq('user_id', req.user.id));
    await invalidatePosts();
    res.json({ success: true, message: 'Comment deleted.' });
  });
  return router;
}
