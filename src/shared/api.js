import { supabase } from '../security/client/auth.js';

// Same-origin requests use Vite's proxy locally and the app server in production.
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const inFlightGets = new Map();
const DEFAULT_TIMEOUT_MS = 20000;

export function apiUrl(path) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

function callerAware(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(signal.reason || new DOMException('Request aborted', 'AbortError'));
  return Promise.race([
    promise,
    new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason || new DOMException('Request aborted', 'AbortError')), { once: true })),
  ]);
}

export async function apiFetch(path, options = {}) {
  const target = apiUrl(path);
  const configuredOrigin = new URL(API_BASE_URL || window.location.origin, window.location.origin).origin;
  if (new URL(target, window.location.origin).origin !== configuredOrigin) throw new Error('API requests must use the configured app server.');
  const { timeoutMs = DEFAULT_TIMEOUT_MS, dedupe = true, signal: callerSignal, ...fetchOptions } = options;
  const headers = new Headers(fetchOptions.headers);
  headers.delete('Authorization');
  if (supabase) {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw new Error('Your session could not be refreshed. Please sign in again.');
    if (data.session?.access_token) headers.set('Authorization', `Bearer ${data.session.access_token}`);
  }
  const method = String(fetchOptions.method || 'GET').toUpperCase();
  const canDedupe = dedupe && (method === 'GET' || method === 'HEAD');
  const key = canDedupe ? `${method}:${target}:${headers.get('Authorization') || 'anonymous'}` : '';
  if (canDedupe && inFlightGets.has(key)) {
    return callerAware(inFlightGets.get(key).then(response => response.clone()), callerSignal);
  }

  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const requestSignal = canDedupe || !callerSignal
    ? timeoutSignal
    : AbortSignal.any([callerSignal, timeoutSignal]);
  const request = fetch(target, { ...fetchOptions, headers, signal: requestSignal });
  if (!canDedupe) return request;

  inFlightGets.set(key, request);
  request.finally(() => inFlightGets.delete(key)).catch(() => {});
  return callerAware(request.then(response => response.clone()), callerSignal);
}
