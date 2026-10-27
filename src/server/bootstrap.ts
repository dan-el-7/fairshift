import type { Hono } from 'hono';
import { createApp } from './app';
import type { AppEnv } from './middleware/auth';
import { loadConfig, nonEmpty, type ServerConfig } from './config';
import { createGenAiClient, createReportAi } from './services/ai';
import { createTts } from './services/tts';
import type { Repo } from './store/repo';
import { createMemoryRepo } from './store/memory';
import { bufferWrites, createRedisRepo, createUpstashKv, type KvClient, type RedisRepo } from './store/redis';
import { istDay } from './domain/time';
import { seedDemo } from './store/seed';

export interface BuildOptions {
  /** Built SPA directory for the Node server. Leave unset on Vercel, which serves static files itself. */
  webRoot?: string;
}

export interface BuiltApp {
  app: Hono<AppEnv>;
  config: ServerConfig;
}

/**
 * Builds config, store (seeded once), AI service and the Hono app. Used by the Node entry point
 * (src/server/index.ts) and the Vercel function (api/index.ts).
 */
export async function buildAppWithConfig(env: NodeJS.ProcessEnv = process.env, options: BuildOptions = {}): Promise<BuiltApp> {
  const config = loadConfig(env);
  if (config.secretGenerated) {
    console.warn('SESSION_SECRET is not set: using a random secret for this process (sessions end on restart).');
  }

  // The Redis client is shared: the store uses it, and so does the speech cache.
  const kv = config.store === 'redis' && config.redis ? createUpstashKv(config.redis.url, config.redis.token) : undefined;
  const repo = await openRepo(config, kv);

  // One Gemini client serves both report triage and read-aloud.
  const client = createGenAiClient(config);
  const ai = createReportAi({ client: client ?? undefined, geminiModel: config.geminiModel });
  const tts = client ? createTts({ client, kv, model: nonEmpty(env.GEMINI_TTS_MODEL?.trim()) }) : null;

  const app = createApp({ repo, ai, tts, config, webRoot: options.webRoot });
  return { app, config };
}

/** Same as buildAppWithConfig, returning only the app. */
export async function buildApp(env: NodeJS.ProcessEnv = process.env, options: BuildOptions = {}): Promise<Hono<AppEnv>> {
  return (await buildAppWithConfig(env, options)).app;
}

/**
 * Opens the configured store and seeds the demo organisation. Redis with DEMO_DAILY_RESET=true
 * clears and reseeds once per IST day (public demo only: this wipes submitted reports too).
 * Otherwise Redis is seeded only when it has never been seeded, and nothing is ever cleared.
 */
export async function openRepo(config: ServerConfig, kv: KvClient | undefined, now: Date = new Date()): Promise<Repo> {
  if (config.store === 'redis') {
    if (!kv) throw new Error('STORE=redis needs a Redis endpoint');
    const repo: RedisRepo = createRedisRepo(kv);
    const today = istDay(now);
    const seeded = await repo.seededDay();
    // The demo's shifts are generated relative to "today", so the daily reset keeps dashboards fresh.
    const needsSeed = config.demoDailyReset ? seeded !== today : seeded === null;
    if (needsSeed) {
      if (config.demoDailyReset) await repo.clear();
      // Seed through a write buffer: a few pipelined round trips instead of hundreds. The seed is
      // deterministic, so two instances cold-starting together just write the same keys twice.
      const buffered = bufferWrites(kv);
      await seedDemo(createRedisRepo(buffered), now);
      await buffered.flush();
      await repo.markSeeded(today);
    }
    return repo;
  }

  let repo: Repo;
  if (config.store === 'firestore') {
    const { createFirestoreRepo } = await import('./store/firestore');
    repo = createFirestoreRepo();
  } else {
    repo = createMemoryRepo();
  }
  if ((await repo.listSites()).length === 0) await seedDemo(repo, new Date());
  return repo;
}
