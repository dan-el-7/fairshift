import type { Hono } from 'hono';
import { createApp } from './app';
import type { AppEnv } from './middleware/auth';
import { loadConfig, type ServerConfig } from './config';
import { createReportAi } from './services/ai';
import type { Repo } from './store/repo';
import { createMemoryRepo } from './store/memory';
import { bufferWrites, createRedisRepo, createUpstashKv, type RedisRepo } from './store/redis';
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

  const repo = await openRepo(config);
  const ai = createReportAi({
    geminiApiKey: config.geminiApiKey,
    googleProject: config.googleProject,
    googleLocation: config.googleLocation,
    geminiModel: config.geminiModel,
  });

  const app = createApp({ repo, ai, config, webRoot: options.webRoot });
  return { app, config };
}

/** Same as buildAppWithConfig, returning only the app. */
export async function buildApp(env: NodeJS.ProcessEnv = process.env, options: BuildOptions = {}): Promise<Hono<AppEnv>> {
  return (await buildAppWithConfig(env, options)).app;
}

/** Opens the configured store and seeds the demo organisation when it is empty. */
async function openRepo(config: ServerConfig): Promise<Repo> {
  if (config.store === 'redis') {
    const redis = config.redis;
    if (!redis) throw new Error('STORE=redis needs a Redis endpoint');
    const kv = createUpstashKv(redis.url, redis.token);
    const repo: RedisRepo = createRedisRepo(kv);
    // The demo's shifts are generated relative to "today", so the shared demo refreshes once per
    // IST day; otherwise dashboards would show stale attendance a few days after deployment.
    const now = new Date();
    const today = istDay(now);
    if ((await repo.seededDay()) !== today) {
      await repo.clear();
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
