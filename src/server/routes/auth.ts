import { Hono } from 'hono';
import { z } from 'zod';
import type { Deps } from '../app';
import { clearSession, issueSession, type AppEnv } from '../middleware/auth';
import { listPersonas, loadMe, sessionContext } from '../services/people';
import { parseBody } from './http';

const demoSchema = z.object({ personaId: z.string().min(1).max(100) });

/** Demo login, personas, logout and the current user. */
export function authRoutes(deps: Deps): Hono<AppEnv> {
  const api = new Hono<AppEnv>();

  api.get('/auth/personas', async (c) => c.json(await listPersonas(deps.repo)));

  api.post('/auth/demo', async (c) => {
    const body = await parseBody(c, demoSchema);
    if (body instanceof Response) return body;

    const personas = await listPersonas(deps.repo);
    const persona = personas.find((p) => p.id === body.personaId);
    if (!persona) return c.json({ error: 'unknown demo persona' }, 404);

    const worker = await deps.repo.getWorker(persona.id);
    if (!worker) return c.json({ error: 'unknown demo persona' }, 404);

    await issueSession(
      c,
      deps.config.sessionSecret,
      { id: worker.id, role: worker.role, siteId: worker.siteId },
      deps.now(),
      deps.config.secureCookies,
    );
    const me = await loadMe(deps.repo, worker);
    if (!me) return c.json({ error: 'site not found' }, 404);
    return c.json(me);
  });

  api.post('/auth/logout', (c) => {
    clearSession(c, deps.config.secureCookies);
    return c.json({ ok: true });
  });

  api.get('/me', async (c) => {
    const ctx = await sessionContext(c, deps.repo);
    if (!ctx) return c.json({ error: 'sign in required' }, 401);
    const me = await loadMe(deps.repo, ctx.worker);
    return me ? c.json(me) : c.json({ error: 'site not found' }, 404);
  });

  return api;
}
