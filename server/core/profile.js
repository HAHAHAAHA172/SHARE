import { Router } from 'express';
import { httpError, text } from '../../src/security/server/validation.js';

const uuid = value => value == null || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const profileFields = 'user_id,user_name,full_name,role,avatar_url,year_level,course_id,created_at,updated_at';

function check(result) {
  if (result.error) {
    if (result.error.code === '42501') throw httpError(403, 'You do not have permission to update this profile.');
    throw httpError(503, 'Profile storage is temporarily unavailable.');
  }
  return result.data;
}

export function createProfileRouter({ createDataClient }) {
  const router = Router();
  const clientFor = req => createDataClient(req.user ? req.get('Authorization')?.slice(7) : undefined);

  router.get('/', async (req, res) => {
    const profile = check(await clientFor(req).from('user_profile').select(profileFields).eq('user_id', req.user.id).maybeSingle());
    if (!profile) throw httpError(404, 'Profile not found.');
    res.set('Cache-Control', 'no-store').json({ profile });
  });

  router.patch('/', async (req, res) => {
    const body = req.body || {};
    if (body.course_id !== undefined && !uuid(body.course_id)) throw httpError(400, 'Invalid course selection.');
    const updates = {
      user_name: text(body.user_name, { name: 'Username', max: 40, required: true }),
      full_name: text(body.full_name, { name: 'Full name', max: 100, required: true }),
      role: text(body.role, { name: 'Role', max: 20, required: true }),
      avatar_url: text(body.avatar_url, { name: 'Avatar URL', max: 500, required: true }),
      year_level: text(body.year_level, { name: 'Year level', max: 40, required: true }),
      course_id: body.course_id ?? null,
      updated_at: new Date().toISOString(),
    };
    if (!['student', 'instructor'].includes(updates.role.toLowerCase())) throw httpError(400, 'Role must be student or instructor.');
    if (updates.avatar_url && !/^https:\/\//i.test(updates.avatar_url)) throw httpError(400, 'Avatar URL must use HTTPS.');
    const profile = check((await clientFor(req).from('user_profile').update(updates).eq('user_id', req.user.id).select(profileFields).maybeSingle()));
    if (!profile) throw httpError(404, 'Profile not found.');
    res.set('Cache-Control', 'no-store').json({ profile });
  });

  return router;
}
