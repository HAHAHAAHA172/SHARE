import { httpError } from './validation.js';

export function createRequireAuth({ verifyAccessToken }) {
  return async (req, _res, next) => {
    const authorization = req.get('Authorization') || '';
    if (!/^Bearer [^\s]+$/i.test(authorization) || authorization.length > 8192) return next(httpError(401, 'Sign in to continue.'));
    if (!verifyAccessToken) return next(httpError(503, 'Sign-in is temporarily unavailable.'));
    try {
      const user = await verifyAccessToken(authorization.slice(7));
      if (!user || typeof user.id !== 'string' || !user.id) return next(httpError(401, 'Your session has expired. Please sign in again.'));
      req.user = user;
      next();
    } catch {
      next(httpError(401, 'Your session has expired. Please sign in again.'));
    }
  };
}

export function limitConcurrentAI({ maxPerUser = 1, maxTotal = 8 } = {}) {
  const active = new Map();
  let total = 0;
  return (req, res, next) => {
    const key = req.user.id;
    if ((active.get(key) || 0) >= maxPerUser || total >= maxTotal) return next(httpError(429, 'A study request is already running. Please try again shortly.'));
    active.set(key, (active.get(key) || 0) + 1);
    total++;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      total--;
      const remaining = (active.get(key) || 1) - 1;
      if (remaining) active.set(key, remaining); else active.delete(key);
    };
    res.once('finish', release);
    res.once('close', release);
    next();
  };
}
