import helmet from 'helmet';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import { httpError } from './validation.js';

export function securityHeaders({ production = false, supabaseUrl } = {}) {
  const connectSrc = ["'self'"];
  if (supabaseUrl) {
    const origin = new URL(supabaseUrl).origin;
    connectSrc.push(origin, origin.replace(/^https:/, 'wss:'));
  }
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"], scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc, fontSrc: ["'self'", 'data:'], objectSrc: ["'none'"],
        baseUri: ["'none'"], frameAncestors: ["'none'"], formAction: ["'self'"],
        upgradeInsecureRequests: production ? [] : null,
      },
    },
    strictTransportSecurity: production ? { maxAge: 31536000, includeSubDomains: true } : false,
    xFrameOptions: { action: 'deny' },
    referrerPolicy: { policy: 'no-referrer' },
    crossOriginEmbedderPolicy: false,
  });
}

export function restrictOrigins(allowedOrigins) {
  const allowed = new Set(allowedOrigins);
  return cors({
    origin(origin, done) {
      if (!origin || allowed.has(origin)) return done(null, true);
      done(httpError(403, 'This origin is not allowed.'));
    },
    methods: ['GET', 'HEAD', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'], exposedHeaders: ['Retry-After'],
    credentials: false, maxAge: 600,
  });
}

export function requestLimiter({ limit, windowMs = 60_000, perUser = false, shared = false, message = 'Too many requests. Please try again later.' }) {
  return rateLimit({
    windowMs, limit, standardHeaders: 'draft-8', legacyHeaders: false,
    ...(perUser ? { keyGenerator: req => req.user.id } : shared ? { keyGenerator: () => 'server-ai-budget' } : {}),
    handler: (_req, res) => res.status(429).json({ error: message }),
  });
}

export function safeErrors(error, _req, res, _next) {
  if (res.headersSent) return res.end();
  let status = Number(error.status || error.statusCode || 500);
  let message = status >= 500 ? 'The request could not be completed. Please try again.' : error.message;
  if (error.type === 'entity.parse.failed') { status = 400; message = 'The request contains invalid JSON.'; }
  if (error.type === 'entity.too.large' || error.code === 'LIMIT_FILE_SIZE') { status = 413; message = 'The request or attachment is too large.'; }
  else if (typeof error.code === 'string' && error.code.startsWith('LIMIT_')) { status = 400; message = 'Too many files or form fields.'; }
  if (!Number.isInteger(status) || status < 400 || status > 599) { status = 500; message = 'The request could not be completed. Please try again.'; }
  res.status(status).json({ error: message || 'The request could not be completed.' });
}
