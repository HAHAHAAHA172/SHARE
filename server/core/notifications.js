import { Router } from 'express';
import { httpError } from '../../src/security/server/validation.js';

function check(result) {
  if (result.error) throw httpError(result.error.code === '42501' ? 403 : 503, 'Notifications are temporarily unavailable.');
  return result.data;
}

export function createNotificationsRouter({ createDataClient }) {
  const router = Router();
  const clientFor = req => createDataClient(req.get('Authorization')?.slice(7));
  router.get('/', async (req, res, next) => {
    try {
      const rows = check(await clientFor(req).from('notifications').select('notification_id,type,title,body,post_id,read_at,created_at').order('created_at', { ascending: false }).limit(50));
      res.set('Cache-Control', 'no-store').json({ notifications: rows || [] });
    } catch (error) { next(error); }
  });
  router.patch('/:id/read', async (req, res, next) => {
    try {
      const id = String(req.params.id || '');
      if (!/^[0-9a-f-]{36}$/i.test(id)) throw httpError(400, 'Invalid notification ID.');
      check(await clientFor(req).from('notifications').update({ read_at: new Date().toISOString() }).eq('notification_id', id).eq('recipient_id', req.user.id));
      res.json({ success: true });
    } catch (error) { next(error); }
  });
  return router;
}
