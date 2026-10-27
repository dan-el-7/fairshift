import { Hono } from 'hono';
import { z } from 'zod';
import type { PassportMe, PassportVerify } from '../../shared/api';
import type { PassportEntry, PassportPayload } from '../../shared/types';
import type { Deps } from '../app';
import { signPassport, verifyPassport } from '../domain/passport';
import { requireRole, type AppEnv } from '../middleware/auth';
import { sessionContext } from '../services/people';
import { parseQuery } from './http';

const verifyQuery = z.object({ token: z.string().min(1).max(16_000) });

/** Strips the worker id: the public payload carries only the entry details. */
function toPublicEntry(entry: PassportEntry): PassportPayload['entries'][number] {
  const out: PassportPayload['entries'][number] = {
    id: entry.id,
    kind: entry.kind,
    title: entry.title,
    issuer: entry.issuer,
    issuedOn: entry.issuedOn,
    industry: entry.industry,
  };
  if (entry.hours !== undefined) out.hours = entry.hours;
  return out;
}

/** Skill passport: the worker's own view, a signed share token, and offline verification. */
export function passportRoutes(deps: Deps): Hono<AppEnv> {
  const api = new Hono<AppEnv>();
  const { repo, config } = deps;

  api.get('/passport/me', requireRole('worker'), async (c) => {
    const ctx = await sessionContext(c, repo);
    if (!ctx) return c.json({ error: 'sign in required' }, 401);

    const entries = (await repo.listPassport(ctx.worker.id)).sort((a, b) =>
      b.issuedOn.localeCompare(a.issuedOn),
    );
    const payload: PassportPayload = {
      workerName: ctx.worker.name,
      entries: entries.map(toPublicEntry),
      issuedAt: deps.now().toISOString(),
    };
    const body: PassportMe = {
      entries,
      shareToken: signPassport(payload, config.passport.privateKey),
    };
    return c.json(body);
  });

  api.get('/passport/verify', (c) => {
    const query = parseQuery(c, verifyQuery);
    if (query instanceof Response) return query;
    const payload = verifyPassport(query.token, config.passport.publicKey);
    const body: PassportVerify = payload ? { valid: true, payload } : { valid: false };
    return c.json(body);
  });

  api.get('/passport/public-key', (c) => c.text(config.passport.publicPem));

  return api;
}
