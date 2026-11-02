// VITE_USER_NODE_ENV is injected by some local IDE/dev-host environments and
// is not a credential. Keep the allow-list explicit for every other VITE_* key.
const publicNames = new Set(['VITE_API_BASE_URL', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_USER_NODE_ENV']);

export function checkPublicEnv(env) {
  for (const [name, value] of Object.entries(env)) {
    if (name.startsWith('VITE_') && !publicNames.has(name)) throw new Error(`Unexpected public environment variable: ${name}. Keep credentials server-only.`);
    if (name === 'VITE_SUPABASE_PUBLISHABLE_KEY' && value && !value.startsWith('sb_publishable_')) throw new Error('The public Supabase variable must contain a publishable key, never a secret key.');
  }
  if (env.VITE_API_BASE_URL) {
    const url = new URL(env.VITE_API_BASE_URL);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('VITE_API_BASE_URL must be an HTTP(S) origin without credentials.');
  }
}
