import { Router } from 'express';

const recoveryMessage = 'If an account matches this email, a password reset link will be sent.';
const validEmail = email => typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const sessionTokens = session => session?.access_token && session?.refresh_token
  ? { access_token: session.access_token, refresh_token: session.refresh_token } : null;

// The caller supplies a fresh, nonpersisting client for every request. Never use a service key.
export function createAuthRouter({ createAuthClient, recoveryRedirectTo } = {}) {
  const router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  for (const action of ['login', 'signup', 'recover']) {
    router.post(`/${action}`, async (req, res) => {
      const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
      const password = req.body?.password;
      const name = typeof req.body?.name === 'string' ? req.body.name.replace(/\p{Cc}/gu, '').trim() : '';
      if (!validEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
      if (action !== 'recover' && (typeof password !== 'string' || password.length < (action === 'signup' ? 10 : 1) || password.length > 128)) {
        return res.status(400).json({ error: action === 'signup' ? 'Use a password between 10 and 128 characters.' : 'Enter your password (up to 128 characters).' });
      }
      if (action === 'signup' && (!name || name.length > 80)) return res.status(400).json({ error: 'Enter a name between 1 and 80 characters.' });
      try {
        const client = createAuthClient?.();
        if (!client) return res.status(503).json({ error: 'Account access is temporarily unavailable.' });
        let result;
        if (action === 'login') result = await client.auth.signInWithPassword({ email, password });
        if (action === 'signup') result = await client.auth.signUp({
          email, password,
          options: { data: { display_name: name }, ...(recoveryRedirectTo ? { emailRedirectTo: recoveryRedirectTo } : {}) },
        });
        if (action === 'recover') result = await client.auth.resetPasswordForEmail(email, recoveryRedirectTo ? { redirectTo: recoveryRedirectTo } : undefined);
        if (result.error?.status === 429) return res.status(429).json({ error: 'Too many attempts. Please try again later.' });
        // Recovery responses cannot reveal account existence or provider details.
        if (action === 'recover') {
          if (result.error && (!result.error.status || result.error.status >= 500)) return res.status(503).json({ error: 'Password reset is temporarily unavailable. Please try again later.' });
          return res.json({ message: recoveryMessage });
        }
        if (result.error) return res.status(action === 'login' ? 401 : 400).json({ error: action === 'login' ? 'Invalid email or password.' : 'Could not create an account. Check your details or try signing in.' });
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
