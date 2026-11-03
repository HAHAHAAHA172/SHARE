import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const apiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const memory = new Map();
export function readDeviceValue(key, fallback = null, persistent = true) {
  try { return window[persistent ? 'localStorage' : 'sessionStorage'].getItem(key) ?? memory.get(`${persistent}:${key}`) ?? fallback; }
  catch { return memory.get(`${persistent}:${key}`) ?? fallback; }
}
export function writeDeviceValue(key, value, persistent = true) {
  const memoryKey = `${persistent}:${key}`;
  memory.delete(memoryKey);
  try {
    const storage = window[persistent ? 'localStorage' : 'sessionStorage'];
    if (value === null) storage.removeItem(key); else storage.setItem(key, value);
  } catch { if (value !== null) memory.set(memoryKey, value); }
}
let remember = readDeviceValue('share-auth-remember') === 'true';
const storage = {
  getItem: key => readDeviceValue(key, null, remember),
  setItem: (key, value) => { writeDeviceValue(key, value, remember); writeDeviceValue(key, null, !remember); },
  removeItem: key => { writeDeviceValue(key, null, true); writeDeviceValue(key, null, false); },
};
export const supabase = url && key ? createClient(url, key, {
  auth: { storage, storageKey: 'share-auth-session', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
}) : null;

async function authRequest(action, body) {
  if (!supabase) throw new Error('Account access is temporarily unavailable.');
  let response;
  try {
    response = await fetch(`${apiBase}/api/auth/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch { throw new Error('Could not reach the server. Please try again.'); }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Account access is temporarily unavailable.');
  return result;
}
async function acceptSession(session, rememberMe) {
  if (!session) return;
  remember = rememberMe;
  writeDeviceValue('share-auth-remember', String(remember));
  const { error } = await supabase.auth.setSession(session);
  if (error) throw new Error('Could not start your session. Please sign in again.');
}
export async function signIn(email, password, rememberMe) {
  const result = await authRequest('login', { email, password });
  await acceptSession(result.session, rememberMe);
  return result;
}
export async function signUp(name, email, password, fullName = '') {
  const result = await authRequest('signup', { name, email, password, ...(fullName ? { fullName } : {}) });
  await acceptSession(result.session, false);
  return result;
}
export const recoverPassword = email => authRequest('recover', { email });
export async function updatePassword(password) {
  if (!supabase || password.length < 10 || password.length > 128) throw new Error('Use a password between 10 and 128 characters.');
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error('Could not update your password. Request a new reset link and try again.');
}
export async function signOut() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) throw new Error('Could not sign out. Please try again.');
}
