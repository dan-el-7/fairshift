import { serve } from '@hono/node-server';
import { resolve } from 'node:path';
import { buildAppWithConfig } from './bootstrap';

const SHUTDOWN_GRACE_MS = 10_000;

/** Boots the server: app (config, store, AI) and HTTP listener with SIGTERM handling. */
async function main(): Promise<void> {
  const { app, config } = await buildAppWithConfig(process.env, {
    webRoot: resolve(process.cwd(), 'dist/web'),
  });

  const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
    const aiMode = config.geminiApiKey ? 'gemini' : config.googleProject ? 'vertex' : 'heuristic';
    console.info(`FairShift listening on port ${info.port} (store=${config.store}, ai=${aiMode})`);
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
