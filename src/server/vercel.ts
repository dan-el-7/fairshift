import { buildApp } from './bootstrap';

type FetchHandler = (req: Request) => Response | Promise<Response>;

// One app per warm instance. The promise is cached so concurrent first requests share one build.
// If the build fails, the cache is cleared so the next request retries.
let handlerPromise: Promise<FetchHandler> | undefined;

function getHandler(): Promise<FetchHandler> {
  handlerPromise ??= buildApp(process.env).then(
    // Same behaviour as hono/vercel's handle (deprecated there): pass each Request straight to Hono.
    (app) => (req) => app.fetch(req),
    (err: unknown) => {
      handlerPromise = undefined;
      throw err;
    },
  );
  return handlerPromise;
}

/**
 * Request handler for the Vercel function. Bundled by `npm run build:api` into api/_handler.mjs so
 * Vercel runs one self-contained file (Node ESM cannot resolve the source's extensionless imports).
 * Vercel Node function for every /api/* request (vercel.json rewrites them here; the request keeps
 * its original path, so Hono routes it normally). Static files are served by Vercel, not here.
 */
export async function handler(req: Request): Promise<Response> {
  try {
    const fetchApp = await getHandler();
    return await fetchApp(req);
  } catch (err) {
    console.error('FairShift failed to start:', err instanceof Error ? err.message : 'unknown error');
    return Response.json({ error: 'server is not configured' }, { status: 500 });
  }
}
