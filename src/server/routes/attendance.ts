import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import type { ShiftWithSummary } from '../../shared/types';
import type { Deps } from '../app';
import { summariseShift, withinGeofence } from '../domain/attendance';
import { detectFatigue } from '../domain/fatigue';
import { verifyQrToken } from '../domain/qrToken';
import { requireRole, type AppEnv } from '../middleware/auth';
import { sessionContext } from '../services/people';
import { effectiveWork } from '../services/corrections';
import { parseBody } from './http';

const checkInSchema = z.union([
  z.object({ qrToken: z.string().min(1).max(200) }),
  z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
]);

const LOOKBACK_DAYS = 14;
const DAY_MS = 86_400_000;

/** Worker check-in, check-out and attendance history. Worker role only. */
export function attendanceRoutes(deps: Deps): Hono<AppEnv> {
  const api = new Hono<AppEnv>();
  const { repo, config } = deps;

  api.post('/attendance/check-in', requireRole('worker'), async (c) => {
    const body = await parseBody(c, checkInSchema);
    if (body instanceof Response) return body;
    const ctx = await sessionContext(c, repo);
    if (!ctx) return c.json({ error: 'sign in required' }, 401);
    const { worker, site, cfg } = ctx;
    const now = deps.now();

    let method: 'qr' | 'geo';
    if ('qrToken' in body) {
      if (!cfg.checkInModes.includes('qr')) return c.json({ error: 'QR check-in is not enabled' }, 403);
      const tokenSite = verifyQrToken(body.qrToken, config.sessionSecret, now);
      if (tokenSite === null) return c.json({ error: 'QR code is invalid or expired' }, 400);
      if (tokenSite !== site.id) return c.json({ error: 'QR code belongs to another site' }, 403);
      method = 'qr';
    } else {
      if (!cfg.checkInModes.includes('geo')) return c.json({ error: 'location check-in is not enabled' }, 403);
      if (!withinGeofence(site, body.lat, body.lng)) {
        return c.json({ error: 'you are outside the site area' }, 403);
      }
      method = 'geo';
    }

    const shift = {
      id: randomUUID(),
      workerId: worker.id,
      siteId: site.id,
      checkIn: now.toISOString(),
      checkOut: null,
      method,
    };
    // Atomic in the store: two concurrent check-ins cannot both open a shift.
    if (!(await repo.startShift(shift))) return c.json({ error: 'already checked in' }, 409);
    return c.json(shift);
  });

  api.post('/attendance/check-out', requireRole('worker'), async (c) => {
    const ctx = await sessionContext(c, repo);
    if (!ctx) return c.json({ error: 'sign in required' }, 401);
    const open = await repo.getOpenShift(ctx.worker.id);
    if (!open) return c.json({ error: 'not checked in' }, 409);

    const closed = { ...open, checkOut: deps.now().toISOString() };
    await repo.saveShift(closed);
    const withSummary: ShiftWithSummary = { ...closed, summary: summariseShift(closed, ctx.cfg) };
    return c.json(withSummary);
  });

  api.get('/attendance/me', requireRole('worker'), async (c) => {
    const ctx = await sessionContext(c, repo);
    if (!ctx) return c.json({ error: 'sign in required' }, 401);
    const now = deps.now();
    const since = new Date(now.getTime() - LOOKBACK_DAYS * DAY_MS).toISOString();
    const work = await effectiveWork(repo, ctx.site.id, ctx.worker.id);
    const shifts = work.shifts.filter((s) => Date.parse(s.checkIn) >= Date.parse(since));

    const recent: ShiftWithSummary[] = shifts
      .slice()
      .reverse()
      .map((s) => ({ ...s, summary: summariseShift(s, ctx.cfg) }));

    return c.json({
      open: shifts.find((s) => s.checkOut === null) ?? null,
      recent,
      fatigue: detectFatigue(shifts, now),
    });
  });

  return api;
}
