import { handle } from 'hono/vercel';
import { buildApp } from '../src/server/bootstrap';

type FetchHandler = (req: Request) => Response | Promise<Response>;

// One app per warm instance. The promise is cached so concurrent first requests share one build.
// If the build fails, the cache is cleared so the next request retries.
let handlerPromise: Promise<FetchHandler> | undefined;

function getHandler(): Promise<FetchHandler> {
  handlerPromise ??= buildApp(process.env).then(
    (app) => handle(app),
    (err: unknown) => {
      handlerPromise = undefined;
      throw err;
    },
  );
  return handlerPromise;
}

/** Vercel Node function for every /api/* request. Static files are served by Vercel, not here. */
export default async function handler(req: Request): Promise<Response> {
  try {
    const fetchApp = await getHandler();
    return await fetchApp(req);
  } catch (err) {
    console.error('FairShift failed to start:', err instanceof Error ? err.message : 'unknown error');
    return Response.json({ error: 'server is not configured' }, { status: 500 });
  }
}
