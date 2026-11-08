import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../shared/api.js';

const REFRESH_AFTER_MS = 30_000;

export default function useNotifications(currentUser) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const lastLoadedAt = useRef(0);
  const requestRef = useRef(null);
  const userId = currentUser?.id || null;

  const refresh = useCallback(async ({ force = false } = {}) => {
    if (!userId) {
      setNotifications([]);
      setError('');
      return;
    }
    if (!force && Date.now() - lastLoadedAt.current < REFRESH_AFTER_MS) return;
    if (!force && requestRef.current) return requestRef.current.promise;
    requestRef.current?.controller.abort();
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const promise = (async () => {
      const response = await apiFetch('/api/notifications', { signal: controller.signal });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not load notifications.');
      if (controller.signal.aborted) return;
      setNotifications(Array.isArray(result.notifications) ? result.notifications : []);
      lastLoadedAt.current = Date.now();
    })();
    requestRef.current = { controller, promise };
    try { await promise; }
    catch (failure) { if (!controller.signal.aborted) setError(failure.message || 'Could not load notifications.'); }
    finally {
      if (requestRef.current?.controller === controller) {
        requestRef.current = null;
        setLoading(false);
      }
    }
  }, [userId]);

  useEffect(() => {
    lastLoadedAt.current = 0;
    const timer = setTimeout(() => void refresh({ force: true }), 0);
    return () => {
      clearTimeout(timer);
      const request = requestRef.current;
      requestRef.current = null;
      request?.controller.abort();
    };
  }, [refresh]);

  return { notifications, loading, error, refresh };
}
