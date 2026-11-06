import { Router } from 'express';
import { httpError, text } from '../../src/security/server/validation.js';

const postIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const statuses = new Set(['pending', 'draft', 'published', 'rejected', 'removed']);

function check(result) {
  if (result.error) {
    if (result.error.code === '42501') throw httpError(403, 'You do not have permission to moderate posts.');
    throw httpError(503, 'Moderation data is temporarily unavailable.');
  }
  return result.data;
}

export function createAdminRouter({ createDataClient, createAdminClient }) {
  const router = Router();
  const clientFor = req => {
    const token = req.get('Authorization')?.slice(7);
    const client = createDataClient(token);
    if (!client) throw httpError(503, 'Database access is temporarily unavailable.');
    return client;
  };

  // Authorization is checked against the database profile, never client metadata.
  router.use(async (req, _res, next) => {
    try {
      const profile = check(await clientFor(req).from('user_profile').select('role').eq('user_id', req.user.id).maybeSingle());
      if (profile?.role !== 'admin') return next(httpError(403, 'Administrator access is required.'));
      next();
    } catch (error) { next(error); }
  });

  router.get('/posts', async (req, res, next) => {
    try {
      const requested = text(req.query.status, { name: 'Status', max: 20, fallback: 'all' }).toLowerCase();
      if (requested !== 'all' && !statuses.has(requested)) throw httpError(400, 'Invalid moderation status.');
      let query = clientFor(req).from('posts').select('id,user_id,title,content,subject,author,post_status,created_at,updated_at,materials(file_name,mime_type,file_size_bytes,storage_path)').order('created_at', { ascending: false }).limit(500);
      if (requested !== 'all') query = query.eq('post_status', requested);
      const rows = check(await query);
      res.set('Cache-Control', 'no-store').json({ posts: rows || [] });
    } catch (error) { next(error); }
  });

  router.get('/users', async (_req, res, next) => {
    try {
      const admin = createAdminClient?.();
      if (!admin) throw httpError(503, 'Administrator account management is not configured.');
      const users = [];
      for (let page = 1; page <= 5; page += 1) {
        const result = await admin.auth.admin.listUsers({ page, perPage: 200 });
        if (result.error) throw httpError(503, 'Account data is temporarily unavailable.');
        const batch = result.data?.users || [];
        users.push(...batch);
        if (batch.length < 200) break;
      }
      const ids = users.map(user => user.id);
      let profiles = [];
      if (ids.length) {
        const result = await admin.from('user_profile').select('user_id,full_name,user_name,role').in('user_id', ids);
        if (result.error) throw httpError(503, 'Profile data is temporarily unavailable.');
        profiles = result.data || [];
      }
      const byId = new Map(profiles.map(profile => [profile.user_id, profile]));
      const accounts = users.map(user => {
        const profile = byId.get(user.id);
        const email = user.email || '';
        return {
          id: user.id,
          email,
          name: profile?.full_name || profile?.user_name || email.split('@')[0] || 'Account',
          role: profile?.role || null,
          canPromote: Boolean(profile) && profile?.role !== 'admin',
        };
      }).sort((a, b) => Number(b.role === 'admin') - Number(a.role === 'admin') || a.name.localeCompare(b.name));
      res.set('Cache-Control', 'no-store').json({ accounts });
    } catch (error) { next(error); }
  });

  router.post('/users/:id/admin', async (req, res, next) => {
    try {
      if (!postIdPattern.test(req.params.id)) throw httpError(400, 'Invalid account ID.');
      const admin = createAdminClient?.();
      if (!admin) throw httpError(503, 'Administrator account management is not configured.');
      const now = new Date().toISOString();
      const result = await admin.from('user_profile').update({ role: 'admin', updated_at: now }).eq('user_id', req.params.id).select('user_id,full_name,user_name,role').maybeSingle();
      if (result.error) throw httpError(503, 'The account could not be promoted.');
      if (!result.data) throw httpError(404, 'This account does not have a profile yet.');
      res.set('Cache-Control', 'no-store').json({ success: true, profile: result.data });
    } catch (error) { next(error); }
  });

  router.patch('/posts/:id', async (req, res, next) => {
    try {
      if (!postIdPattern.test(req.params.id)) throw httpError(400, 'Invalid post ID.');
      const status = text(req.body?.status, { name: 'Status', max: 20, required: true }).toLowerCase();
      if (!statuses.has(status)) throw httpError(400, 'Invalid moderation status.');
      const client = clientFor(req);
      const reason = text(req.body?.reason, { name: 'Reason', max: 500, fallback: status === 'removed' ? 'Removed by administrator.' : status === 'rejected' ? 'Rejected by administrator.' : 'Approved by administrator.' });
      const now = new Date().toISOString();
      const rows = check(await client.from('posts').update({ post_status: status, updated_at: now }).eq('id', req.params.id).select('id,post_status,updated_at'));
      if (!rows?.length) throw httpError(404, 'Post not found or already unavailable.');
      check(await client.from('moderation_actions').insert({ post_id: req.params.id, admin_user_id: req.user.id, action: status, reason, created_at: now }));
      res.json({ success: true, post: rows[0] });
    } catch (error) { next(error); }
  });

  return router;
}
