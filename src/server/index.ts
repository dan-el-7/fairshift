import { serve } from '@hono/node-server';
import { resolve } from 'node:path';
import { createApp } from './app';
import { loadConfig } from './config';
import { createReportAi } from './services/ai';
import type { Repo } from './store/repo';
import { createMemoryRepo } from './store/memory';
import { seedDemo } from './store/seed';

const SHUTDOWN_GRACE_MS = 10_000;

/** Boots the server: config, store (seeded when empty), AI service, HTTP listener and SIGTERM handling. */
async function main(): Promise<void> {
  const config = loadConfig();

  if (config.secretGenerated) {
    console.warn('SESSION_SECRET is not set: using a random secret for this process (sessions end on restart).');
  }

  let repo: Repo;
  if (config.store === 'firestore') {
    const { createFirestoreRepo } = await import('./store/firestore');
    repo = createFirestoreRepo();
  } else {
    repo = createMemoryRepo();
  }
  if ((await repo.listSites()).length === 0) {
    await seedDemo(repo, new Date());
  }

  const ai = createReportAi({
    googleProject: config.googleProject,
    googleLocation: config.googleLocation,
    geminiModel: config.geminiModel,
  });

  const app = createApp({
    repo,
    ai,
    config,
    webRoot: resolve(process.cwd(), 'dist/web'),
  });

  const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
    const aiMode = config.googleProject ? 'vertex' : 'heuristic';
    console.log(`FairShift listening on port ${info.port} (store=${config.store}, ai=${aiMode})`);
  });

  let stopping = false;
  const shutdown = (): void => {
    if (stopping) return;
    stopping = true;
    const forced = setTimeout(() => process.exit(0), SHUTDOWN_GRACE_MS);
    forced.unref();
    server.close(() => process.exit(0));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err: unknown) => {
  console.error('FairShift failed to start:', err instanceof Error ? err.message : 'unknown error');
  process.exit(1);
});
