import { describe, expect, it } from 'vitest';
import type { AttendanceMe } from '../../../src/shared/api';
import type { Shift, ShiftWithSummary } from '../../../src/shared/types';
import { qrToken } from '../../../src/server/domain/qrToken';
import {
  FATIGUE_WORKER,
  NOW,
  SESSION_SECRET,
  WORKER_SKYLINE,
  json,
  login,
  makeTestApp,
  send,
  sessionCookieFor,
} from './harness';

const HOUR_MS = 3_600_000;

/** A worker's own QR check-in token for a site, valid at the given instant. */
function tokenFor(siteId: string, at: Date): string {
  return qrToken(siteId, SESSION_SECRET, at);
}

describe('check-in', () => {
  it('accepts a valid site QR token and returns an open shift', async () => {
    const t = await makeTestApp();
    const cookie = await login(t, WORKER_SKYLINE);
    const res = await send(t, 'POST', '/api/attendance/check-in', {
      cookie,
      body: { qrToken: tokenFor('site-skyline', NOW) },
    });
    expect(res.status).toBe(200);
    const shift = await json<Shift>(res);
    expect(shift.workerId).toBe(WORKER_SKYLINE);
    expect(shift.siteId).toBe('site-skyline');
    expect(shift.checkOut).toBeNull();
    expect(shift.method).toBe('qr');
  });

  it('lets only one of two simultaneous check-ins open a shift', async () => {
    const t = await makeTestApp();
    const cookie = await login(t, WORKER_SKYLINE);
    const body = { qrToken: tokenFor('site-skyline', NOW) };
    const results = await Promise.all([
      send(t, 'POST', '/api/attendance/check-in', { cookie, body }),
      send(t, 'POST', '/api/attendance/check-in', { cookie, body }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const open = (await t.repo.listShifts({ workerId: WORKER_SKYLINE })).filter((s) => s.checkOut === null);
    expect(open).toHaveLength(1);
  });

  it('rejects a QR token issued for another site', async () => {
    const t = await makeTestApp();
    const cookie = await login(t, WORKER_SKYLINE);
    const res = await send(t, 'POST', '/api/attendance/check-in', {
      cookie,
      body: { qrToken: tokenFor('site-greenfield', NOW) },
    });
    expect(res.status).toBe(403);
  });

  it('rejects an expired QR token', async () => {
    const t = await makeTestApp();
    const cookie = await login(t, WORKER_SKYLINE);
    const old = tokenFor('site-skyline', new Date(NOW.getTime() - 5 * 60_000));
    const res = await send(t, 'POST', '/api/attendance/check-in', { cookie, body: { qrToken: old } });
    expect(res.status).toBe(400);
  });

  it('rejects a location outside the site geofence', async () => {
    const t = await makeTestApp();
    const cookie = await login(t, WORKER_SKYLINE);
    const res = await send(t, 'POST', '/api/attendance/check-in', {
      cookie,
      body: { lat: 13.1, lng: 80.2707 },
    });
    expect(res.status).toBe(403);
    expect(await t.repo.getOpenShift(WORKER_SKYLINE)).toBeNull();
  });

  it('accepts a location inside the geofence', async () => {
    const t = await makeTestApp();
    const cookie = await login(t, WORKER_SKYLINE);
    const res = await send(t, 'POST', '/api/attendance/check-in', {
      cookie,
      body: { lat: 13.083, lng: 80.271 },
    });
    expect(res.status).toBe(200);
    expect((await json<Shift>(res)).method).toBe('geo');
  });

  it('returns 409 on a second check-in while a shift is open', async () => {
    const t = await makeTestApp();
    const cookie = await login(t, WORKER_SKYLINE);
    const body = { qrToken: tokenFor('site-skyline', NOW) };
    expect((await send(t, 'POST', '/api/attendance/check-in', { cookie, body })).status).toBe(200);
    expect((await send(t, 'POST', '/api/attendance/check-in', { cookie, body })).status).toBe(409);
  });

  it('rejects a body that is neither a QR token nor a location', async () => {
    const t = await makeTestApp();
    const cookie = await login(t, WORKER_SKYLINE);
    const res = await send(t, 'POST', '/api/attendance/check-in', { cookie, body: { lat: 'north' } });
    expect(res.status).toBe(400);
  });
});

describe('check-out and attendance history', () => {
  it('closes the open shift and returns its summary', async () => {
    const t = await makeTestApp();
    const cookie = await login(t, WORKER_SKYLINE);
    await send(t, 'POST', '/api/attendance/check-in', {
      cookie,
      body: { qrToken: tokenFor('site-skyline', NOW) },
    });

    t.clock.now = new Date(NOW.getTime() + 8.5 * HOUR_MS);
    const res = await send(t, 'POST', '/api/attendance/check-out', { cookie, body: {} });
    expect(res.status).toBe(200);
    const closed = await json<ShiftWithSummary>(res);
    expect(closed.checkOut).not.toBeNull();
    expect(closed.summary.hours).toBe(8.5);
    expect(closed.summary.regularHours).toBe(8);
    expect(closed.summary.overtimeHours).toBe(0.5);
    expect(closed.summary.nightHours).toBe(2);
  });

  it('returns 409 when checking out without an open shift', async () => {
    const t = await makeTestApp();
    const cookie = await login(t, WORKER_SKYLINE);
    expect((await send(t, 'POST', '/api/attendance/check-out', { cookie, body: {} })).status).toBe(409);
  });

  it('shows the open shift, recent shifts and fatigue flags on /attendance/me', async () => {
    const t = await makeTestApp();
    const cookie = await login(t, WORKER_SKYLINE);
    await send(t, 'POST', '/api/attendance/check-in', {
      cookie,
      body: { qrToken: tokenFor('site-skyline', NOW) },
    });
    const view = await json<AttendanceMe>(await send(t, 'GET', '/api/attendance/me', { cookie }));
    expect(view.open?.workerId).toBe(WORKER_SKYLINE);
    expect(view.recent.length).toBeGreaterThan(0);
    expect(view.recent[0]?.summary).toHaveProperty('hours');
  });

  it('flags long shifts and no rest day for the fatigue demo worker', async () => {
    const t = await makeTestApp();
    const cookie = await sessionCookieFor(FATIGUE_WORKER, 'worker', 'site-skyline');
    const view = await json<AttendanceMe>(await send(t, 'GET', '/api/attendance/me', { cookie }));
    const rules = view.fatigue.map((f) => f.rule);
    expect(rules).toContain('long_shift');
    expect(rules).toContain('no_rest_day');
  });
});
