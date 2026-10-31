import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AppConfig } from './config';
import { sessionMiddleware, type AppEnv } from './middleware/auth';
import { bodySizeLimit, rateLimit, securityHeaders } from './middleware/security';
import { adminRoutes } from './routes/admin';
import { attendanceRoutes } from './routes/attendance';
import { authRoutes } from './routes/auth';
import { correctionRoutes } from './routes/corrections';
import { feedbackRoutes } from './routes/feedback';
import { passportRoutes } from './routes/passport';
import { payRoutes } from './routes/pay';
import { paymentRoutes } from './routes/payments';
import { patternRoutes } from './routes/patterns';
import { reportRoutes } from './routes/reports';
import { ttsRoutes } from './routes/tts';
import type { ReportAI } from './services/ai';
import type { Tts } from './services/tts';
import type { Repo } from './store/repo';

/** Everything route handlers need. Injected so tests can use a memory repo, a fake AI and a fixed clock. */
export interface Deps {
  repo: Repo;
  ai: ReportAI;
  /** Read-aloud audio. Null when no speech service is configured: the route answers 503. */
  tts: Tts | null;
  config: AppConfig;
  now: () => Date;
}

export interface AppDeps {
  repo: Repo;
  ai: ReportAI;
  /** Read-aloud audio. Omitted or null when no speech service is configured. */
  tts?: Tts | null;
  config: AppConfig;
  /** Clock. Defaults to the real time. */
  now?: () => Date;
  /** Built SPA directory (dist/web). When set, GETs outside /api are served from it with index.html fallback. */
  webRoot?: string;
}

const MINUTE_MS = 60_000;

/**
 * Builds the Hono application. Middleware order: security headers, body limit, rate limits,
 * session parsing, then routes. API paths are always under /api.
 */
export function createApp(input: AppDeps): Hono<AppEnv> {
  const deps: Deps = {
    repo: input.repo,
    ai: input.ai,
    tts: input.tts ?? null,
    config: input.config,
    now: input.now ?? (() => new Date()),
  };
  const app = new Hono<AppEnv>();

  app.onError((err, c) => {
    console.error('request failed:', err instanceof Error ? err.name : 'unknown error');
    return c.json({ error: 'internal error' }, 500);
  });

  app.use('*', securityHeaders);
  app.use('/api/*', bodySizeLimit);
  app.use('/api/*', rateLimit({ name: 'api', limit: 60, windowMs: MINUTE_MS, now: deps.now }));
  app.use('/api/reports', rateLimit({ name: 'report', limit: 10, windowMs: MINUTE_MS, now: deps.now }));
  app.use('/api/feedback', rateLimit({ name: 'feedback', limit: 10, windowMs: MINUTE_MS, now: deps.now }));
  app.use('/api/tts', rateLimit({ name: 'tts', limit: 30, windowMs: MINUTE_MS, now: deps.now }));
  app.use('/api/*', sessionMiddleware(deps.config.sessionSecret, deps.now));

  app.get('/api/health', (c) => c.json({ ok: true }));
  app.route('/api', authRoutes(deps));
  app.route('/api', attendanceRoutes(deps));
  app.route('/api', correctionRoutes(deps));
  app.route('/api', payRoutes(deps));
  app.route('/api', paymentRoutes(deps));
  app.route('/api', patternRoutes(deps));
  app.route('/api', reportRoutes(deps));
  app.route('/api', feedbackRoutes(deps));
  app.route('/api', passportRoutes(deps));
  app.route('/api', ttsRoutes(deps));
  app.route('/api', adminRoutes(deps));

  if (input.webRoot) {
    const root = input.webRoot;
    // Hashed build assets never change, so cache them for a year. Everything else (index.html,
    // sw.js, manifest) must revalidate so a new deploy reaches users immediately.
    app.use('*', async (c, next) => {
      await next();
      if (c.req.path.startsWith('/api/') || c.res.headers.has('cache-control')) return;
      const immutable = c.req.path.startsWith('/assets/') && c.res.status === 200;
      c.header('Cache-Control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache');
    });
    app.use('*', serveStatic({ root }));
    app.get('*', async (c) => {
      if (c.req.path.startsWith('/api/')) return c.json({ error: 'not found' }, 404);
      try {
        return c.html(await readFile(join(root, 'index.html'), 'utf8'));
      } catch {
        return c.json({ error: 'web app is not built' }, 404);
      }
    });
  }

  app.notFound((c) => c.json({ error: 'not found' }, 404));
  return app;
}
