import { supabase } from '../security/client/auth.js';

// Same-origin requests use Vite's proxy locally and the app server in production.
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export function apiUrl(path) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export async function apiFetch(path, options = {}) {
  const target = apiUrl(path);
  const configuredOrigin = new URL(API_BASE_URL || window.location.origin, window.location.origin).origin;
  if (new URL(target, window.location.origin).origin !== configuredOrigin) throw new Error('API requests must use the configured app server.');
  const headers = new Headers(options.headers);
  headers.delete('Authorization');
  if (supabase) {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw new Error('Your session could not be refreshed. Please sign in again.');
    if (data.session?.access_token) headers.set('Authorization', `Bearer ${data.session.access_token}`);
  }
  return fetch(target, { ...options, headers });
}
