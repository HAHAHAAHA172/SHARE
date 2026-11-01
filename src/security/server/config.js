import { createClient } from '@supabase/supabase-js';

function integer(value, fallback, minimum, maximum, name) {
  const number = value === undefined || value === '' ? fallback : Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) throw new Error(`${name} is invalid.`);
  return number;
}

export function readServerConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (supabaseUrl && !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(supabaseUrl)) throw new Error('Configure a valid HTTPS Supabase project URL.');
  if (publishableKey && !publishableKey.startsWith('sb_publishable_')) throw new Error('Configure a Supabase publishable key, never a secret key.');
  const allowedOrigins = (env.APP_ORIGINS || (production ? '' : 'http://localhost:5173,http://127.0.0.1:5173')).split(',').map(value => value.trim()).filter(Boolean);
  if (allowedOrigins.some(value => { try { const parsed = new URL(value); return parsed.origin !== value || (production && parsed.protocol !== 'https:'); } catch { return true; } })) throw new Error('APP_ORIGINS must contain exact HTTP(S) origins.');
  if (production && (!supabaseUrl || !publishableKey || !allowedOrigins.length || !env.DATA_DIR || !env.UPLOADS_DIR)) {
    throw new Error('Production requires Supabase configuration, APP_ORIGINS, DATA_DIR, and UPLOADS_DIR.');
  }
  return {
    production, supabaseUrl, publishableKey, allowedOrigins,
    port: integer(env.PORT, 3001, 1, 65535, 'PORT'),
    trustProxy: integer(env.TRUST_PROXY_HOPS, 0, 0, 3, 'TRUST_PROXY_HOPS'),
    dataDir: env.DATA_DIR || undefined, uploadsDir: env.UPLOADS_DIR || undefined,
    recoveryRedirectTo: env.AUTH_REDIRECT_URL || (allowedOrigins[0] ? `${allowedOrigins[0]}/#/login` : undefined),
  };
}

export function authClientFactory({ supabaseUrl, publishableKey }) {
  if (!supabaseUrl || !publishableKey) return () => null;
  return () => createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (url, options = {}) => fetch(url, { ...options, signal: AbortSignal.timeout(10_000) }) },
  });
}
