import { Router } from 'express';
import { httpError, text } from '../../src/security/server/validation.js';
import { createUpload, validateUploadedFile, removeUpload } from '../../src/security/server/uploads.js';
import { readFile } from 'node:fs/promises';

const uuid = value => value == null || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const profileFields = 'user_id,user_name,full_name,role,avatar_url,avatar_path,year_level,course_id,created_at,updated_at';

function check(result) {
  if (result.error) {
    if (result.error.code === '42501') throw httpError(403, 'You do not have permission to update this profile.');
    throw httpError(503, 'Profile storage is temporarily unavailable.');
  }
  return result.data;
}

export function createProfileRouter({ createDataClient, storageBucket = 'avatars', uploadsDir = './uploads' }) {
  const router = Router();
  const upload = createUpload(uploadsDir, { kind: 'avatar' });
  const clientFor = req => createDataClient(req.user ? req.get('Authorization')?.slice(7) : undefined);
  const withAvatar = async (client, profile) => {
    if (!profile?.avatar_path) return profile;
    const signed = await client.storage.from(storageBucket).createSignedUrl(profile.avatar_path, 3600);
    return signed.error ? profile : { ...profile, avatar_url: signed.data.signedUrl };
  };

  router.get('/', async (req, res) => {
    const profile = check(await clientFor(req).from('user_profile').select(profileFields).eq('user_id', req.user.id).maybeSingle());
    if (!profile) throw httpError(404, 'Profile not found.');
    res.set('Cache-Control', 'no-store').json({ profile: await withAvatar(clientFor(req), profile) });
  });

  router.get('/courses', async (req, res) => {
    const result = await clientFor(req).from('courses').select('course_id,course_name').order('course_name');
    if (result.error) throw httpError(503, 'Course options are temporarily unavailable.');
    res.set('Cache-Control', 'no-store').json({ courses: result.data || [] });
  });

  router.patch('/', async (req, res) => {
    const body = req.body || {};
    if (body.course_id !== undefined && !uuid(body.course_id)) throw httpError(400, 'Invalid course selection.');
    const updates = {
      user_name: text(body.user_name, { name: 'Username', max: 40, required: true }),
      full_name: text(body.full_name, { name: 'Full name', max: 100, required: true }),
      role: text(body.role, { name: 'Role', max: 20, required: true }),
      avatar_url: text(body.avatar_url, { name: 'Avatar URL', max: 500 }),
      year_level: text(body.year_level, { name: 'Year level', max: 40, required: true }),
      course_id: body.course_id ?? null,
      updated_at: new Date().toISOString(),
    };
    if (!updates.course_id) throw httpError(400, 'Select a course.');
    if (!['student', 'instructor'].includes(updates.role.toLowerCase())) throw httpError(400, 'Role must be student or instructor.');
    if (updates.avatar_url && !/^https:\/\//i.test(updates.avatar_url)) throw httpError(400, 'Avatar URL must use HTTPS.');
    const profile = check((await clientFor(req).from('user_profile').update(updates).eq('user_id', req.user.id).select(profileFields).maybeSingle()));
    if (!profile) throw httpError(404, 'Profile not found.');
    res.set('Cache-Control', 'no-store').json({ profile: await withAvatar(clientFor(req), profile) });
  });

  router.post('/avatar', upload.single('avatar'), async (req, res) => {
    try {
      await validateUploadedFile(req.file, { kind: 'avatar' });
      const extension = req.file.originalname.toLowerCase().match(/\.(jpg|jpeg|png|webp)$/)?.[1] || 'png';
      const storagePath = `${req.user.id}/avatar.${extension}`;
      const client = clientFor(req);
      const stored = await client.storage.from(storageBucket).upload(storagePath, await readFile(req.file.path), { contentType: req.file.mimetype, upsert: true });
      if (stored.error) throw httpError(503, 'Avatar storage is temporarily unavailable.');
      const updated = check(await client.from('user_profile').update({ avatar_path: storagePath, avatar_url: null, updated_at: new Date().toISOString() }).eq('user_id', req.user.id).select(profileFields).maybeSingle());
      if (!updated) throw httpError(404, 'Profile not found.');
      res.status(201).json({ profile: await withAvatar(client, updated) });
    } finally { await removeUpload(req.file); }
  });

  return router;
}
