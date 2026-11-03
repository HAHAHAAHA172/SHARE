import { Router } from 'express';
import { formalName } from './validation.js';

const recoveryMessage = 'If an account matches this email, a password reset link will be sent.';
const validEmail = email => typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const sessionTokens = session => session?.access_token && session?.refresh_token
  ? { access_token: session.access_token, refresh_token: session.refresh_token } : null;

// The caller supplies a fresh, nonpersisting client for every request. Never use a service key.
export function createAuthRouter({ createAuthClient, createDataClient, recoveryRedirectTo } = {}) {
  const router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  for (const action of ['login', 'signup', 'recover']) {
    router.post(`/${action}`, async (req, res) => {
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      const password = req.body?.password;
      let name, fullName;
      try {
        name = formalName(req.body?.name, { name: 'Name', max: 80 });
        fullName = formalName(req.body?.fullName, { name: 'Full name', max: 100 });
      } catch (error) {
        return res.status(error.status || 400).json({ error: error.message || 'Invalid profile name.' });
      }
      if (!validEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
      if (action !== 'recover' && (typeof password !== 'string' || password.length < (action === 'signup' ? 10 : 1) || password.length > 128)) {
        return res.status(400).json({ error: action === 'signup' ? 'Use a password between 10 and 128 characters.' : 'Enter your password (up to 128 characters).' });
      }
      if (action === 'signup' && (!name || name.length > 80)) return res.status(400).json({ error: 'Enter a username between 1 and 80 characters.' });
      try {
        if (action === 'signup' && createDataClient) {
          const client = createDataClient();
          const [usernameMatch, fullNameMatch] = await Promise.all([
            client.from('user_profile').select('user_id').ilike('user_name', name).limit(1),
            fullName ? client.from('user_profile').select('user_id').ilike('full_name', fullName).limit(1) : Promise.resolve({ data: [], error: null }),
          ]);
          // RLS may intentionally hide profiles from the anonymous signup client;
          // the unique indexes remain the authoritative race-safe protection.
          if (!usernameMatch.error && usernameMatch.data?.length) return res.status(409).json({ error: 'That username is already in use.' });
          if (!fullNameMatch.error && fullNameMatch.data?.length) return res.status(409).json({ error: 'That name is already registered.' });
        }
        const client = createAuthClient?.();
        if (!client) return res.status(503).json({ error: 'Account access is temporarily unavailable.' });
        let result;
        if (action === 'login') result = await client.auth.signInWithPassword({ email, password });
        if (action === 'signup') result = await client.auth.signUp({
          email, password,
          options: { data: { display_name: name, ...(fullName ? { full_name: fullName } : {}) }, ...(recoveryRedirectTo ? { emailRedirectTo: recoveryRedirectTo } : {}) },
        });
        if (action === 'recover') result = await client.auth.resetPasswordForEmail(email, recoveryRedirectTo ? { redirectTo: recoveryRedirectTo } : undefined);
        if (result.error?.status === 429) return res.status(429).json({ error: 'Too many attempts. Please try again later.' });
        // Recovery responses cannot reveal account existence or provider details.
        if (action === 'recover') {
          if (result.error && (!result.error.status || result.error.status >= 500)) return res.status(503).json({ error: 'Password reset is temporarily unavailable. Please try again later.' });
          return res.json({ message: recoveryMessage });
        }
        if (result.error) {
          if (action === 'signup' && /already registered|already exists|user already/i.test(result.error.message || '')) return res.status(409).json({ error: 'That email is already registered.' });
          if (action === 'signup' && result.error.code === '23505') {
            const field = /username/i.test(result.error.message || '') ? 'username' : 'name';
            return res.status(409).json({ error: `That ${field} is already in use.` });
          }
          return res.status(action === 'login' ? 401 : 400).json({ error: action === 'login' ? 'Invalid email or password.' : 'Could not create an account. Check your details or try signing in.' });
        }
        const session = sessionTokens(result.data?.session);
        if (action === 'login' && !session) return res.status(401).json({ error: 'Invalid email or password.' });
        return res.status(action === 'signup' ? 201 : 200).json({ session, ...(session ? {} : { message: 'Check your email to confirm your account before signing in.' }) });
      } catch {
        return res.status(503).json({ error: 'Account access is temporarily unavailable. Please try again later.' });
      }
    });
  }
  return router;
}
