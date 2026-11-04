import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { createPostsRouter, createResourceDownload } from './core/posts.js';
import { createSupabasePostsRouter } from './core/supabasePosts.js';
import { createSocialRouter } from './core/social.js';
import { createProfileRouter } from './core/profile.js';
import { createAdminRouter } from './core/admin.js';
import { createChatbotRouter } from './chatbot/routes.js';
import { createConversationsRouter } from './chatbot/conversations.js';
import { securityHeaders, restrictOrigins, requestLimiter, safeErrors } from '../src/security/server/http.js';
import { createRequireAuth, limitConcurrentAI } from '../src/security/server/auth.js';
import { createAuthRouter } from '../src/security/server/authRoutes.js';
import { tmpdir } from 'node:os';

const projectDir = fileURLToPath(new URL('../', import.meta.url));

export function createApp({ dataDir = path.join(projectDir, 'data'), uploadsDir = path.join(projectDir, 'uploads'),
  tempDir = path.join(tmpdir(), `share-ai-${process.pid}`), ai = null, verifyAccessToken, createAuthClient, createDataClient, storageBucket,
  production = false, allowedOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'], trustProxy = 0,
  supabaseUrl, recoveryRedirectTo, rateLimits = {}, aiTimeoutMs = 45000, staticDir = path.join(projectDir, 'dist') } = {}) {
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(uploadsDir, { recursive: true });
  mkdirSync(tempDir, { recursive: true });
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxy || false);
  app.use(securityHeaders({ production, supabaseUrl }));
  app.use(restrictOrigins(allowedOrigins));
  app.use('/api', requestLimiter({ limit: rateLimits.api ?? 120 }));
  app.use('/api/conversations', express.json({ limit: '512kb', strict: true }));
  app.use(express.json({ limit: '64kb', strict: true }));
  const requireAuth = createRequireAuth({ verifyAccessToken });
  const writeLimit = requestLimiter({ limit: rateLimits.writes ?? 20, windowMs: 60 * 60 * 1000, perUser: true });
  const aiLimit = requestLimiter({ limit: rateLimits.ai ?? 30, windowMs: 60 * 60 * 1000, perUser: true, message: 'Your study request limit has been reached. Please try again later.' });
  app.use('/api/auth', requestLimiter({ limit: rateLimits.auth ?? 10, windowMs: 15 * 60 * 1000 }), createAuthRouter({ createAuthClient, createDataClient, recoveryRedirectTo }));
  app.get('/api/me', requireAuth, (req, res) => res.set('Cache-Control', 'no-store').json({ user: { id: req.user.id } }));
  app.use('/api/conversations', requireAuth, requestLimiter({ limit: 60, perUser: true }), createConversationsRouter({ createDataClient }));
  if (createDataClient) app.use('/api/profile', requireAuth, requestLimiter({ limit: rateLimits.writes ?? 20, windowMs: 60 * 60 * 1000, perUser: true }), createProfileRouter({ createDataClient, storageBucket: process.env.SUPABASE_AVATAR_BUCKET || 'avatars', uploadsDir }));
  if (createDataClient) app.use('/api/admin', requireAuth, requestLimiter({ limit: rateLimits.writes ?? 20, windowMs: 60 * 60 * 1000, perUser: true }), createAdminRouter({ createDataClient }));
  if (!createDataClient) app.get('/uploads/:filename', requestLimiter({ limit: rateLimits.downloads ?? 60 }), createResourceDownload({ dataDir, uploadsDir }));
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', name: 'S.H.A.R.E', aiConfigured: Boolean(ai) }));
  app.use('/api/posts', (req, res, next) => {
    if (['GET', 'HEAD'].includes(req.method)) return req.get('Authorization') ? requireAuth(req, res, next) : next();
    requireAuth(req, res, error => error ? next(error) : writeLimit(req, res, next));
  }, createSocialRouter({ createDataClient }), createDataClient ? createSupabasePostsRouter({ createDataClient, uploadsDir, storageBucket,
    downloadLimit: requestLimiter({ limit: rateLimits.downloads ?? 60 }) }) : createPostsRouter({ dataDir, uploadsDir }));
  app.use(['/api/chat', '/api/quiz'], requestLimiter({ limit: rateLimits.aiIp ?? 60, windowMs: 60 * 60 * 1000 }),
    requireAuth, aiLimit, requestLimiter({ limit: rateLimits.aiGlobal ?? 120, windowMs: 60 * 60 * 1000, shared: true }), limitConcurrentAI());
  app.use('/api', createChatbotRouter({ ai, uploadsDir: tempDir, aiTimeoutMs }));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found.' }));
  if (production) app.use(express.static(staticDir, { dotfiles: 'deny', index: 'index.html' }));
  app.use((_req, res) => res.status(404).type('text/plain').send('Page not found.'));
  app.use(safeErrors);
  return app;
}
