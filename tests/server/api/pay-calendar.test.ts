import { describe, expect, it } from 'vitest';
import type { DayOff, PayCalendar, Payslip } from '../../../src/shared/types';
import { ADMIN_GREENFIELD, ADMIN_SKYLINE, WORKER_GREENFIELD, WORKER_SKYLINE, json, login, makeTestApp, send } from './harness';

describe('pay calendar and site schedule', () => {
  it.each([WORKER_SKYLINE, WORKER_GREENFIELD])('reconciles daily estimates with monthly pay for %s, keeping advances monthly', async (id) => {
    const app = await makeTestApp();
    const person = (await app.repo.getWorker(id))!;
    await app.repo.saveWorker({ ...person, advanceThisPeriod: 12345 });
    const cookie = await login(app, id);
    const slip = await json<Payslip>(await send(app, 'GET', '/api/pay/me', { cookie }));
    const calendar = await json<PayCalendar>(await send(app, 'GET', '/api/pay/calendar', { cookie }));
    expect(calendar.days).toHaveLength(31);
    expect(calendar.days.reduce((sum, d) => sum + d.net, calendar.monthlyAdjustment)).toBe(slip.net);
    expect(calendar.days.reduce((sum, d) => sum + d.pf, 0)).toBeLessThanOrEqual(slip.lines.find((l) => l.key === 'pay.pf')?.amount ?? 0);
    expect(calendar.days.reduce((sum, d) => sum + d.esi, 0)).toBeLessThanOrEqual(slip.lines.find((l) => l.key === 'pay.esi')?.amount ?? 0);
    for (const day of calendar.days) {
      expect(Number.isInteger(day.net)).toBe(true);
      expect(day.net).toBe(day.base + day.overtime + day.night - day.pf - day.esi);
      if (day.day > calendar.today) expect(day.gross).toBe(0);
    }
    const noAdvance = { ...person, advanceThisPeriod: 0 };
    await app.repo.saveWorker(noAdvance);
    const without = await json<PayCalendar>(await send(app, 'GET', '/api/pay/calendar', { cookie }));
    expect(without.days).toEqual(calendar.days);
    expect(calendar.monthlyAdjustment).toBe(without.monthlyAdjustment - 12345);
  });

  it('lets an admin mark and remove a site day off, scopes it to the site and never changes pay', async () => {
    const app = await makeTestApp();
    const admin = await login(app, ADMIN_SKYLINE);
    const worker = await login(app, WORKER_SKYLINE);
    const before = await json<Payslip>(await send(app, 'GET', '/api/pay/me', { cookie: worker }));
    const response = await send(app, 'POST', '/api/admin/days-off', { cookie: admin, body: { day: '2026-10-26', label: 'Site maintenance', active: true, siteId: 'other-site' } });
    expect(response.status).toBe(200);
    const off = await json<DayOff>(response);
    expect(off.siteId).not.toBe('other-site');
    const calendar = await json<PayCalendar>(await send(app, 'GET', '/api/pay/calendar', { cookie: worker }));
    expect(calendar.days.find((d) => d.day === off.day)?.dayOff).toBe(off.label);
    expect(await json(await send(app, 'GET', '/api/pay/me', { cookie: worker }))).toEqual(before);
    const otherAdmin = await login(app, ADMIN_GREENFIELD);
    expect(await json(await send(app, 'GET', '/api/admin/days-off', { cookie: otherAdmin }))).toEqual([]);
    await send(app, 'POST', '/api/admin/days-off', { cookie: admin, body: { ...off, active: false } });
    expect(await json(await send(app, 'GET', '/api/admin/days-off', { cookie: admin }))).toEqual([]);
  });

  it('requires the correct role and validates dates, labels and months', async () => {
    const app = await makeTestApp();
    expect((await send(app, 'GET', '/api/pay/calendar')).status).toBe(401);
    const worker = await login(app, WORKER_SKYLINE);
    const admin = await login(app, ADMIN_SKYLINE);
    expect((await send(app, 'GET', '/api/pay/calendar', { cookie: admin })).status).toBe(403);
    expect((await send(app, 'POST', '/api/admin/days-off', { cookie: worker, body: {} })).status).toBe(403);
    for (const body of [{ day: '2026-02-30', label: 'Closed', active: true }, { day: '2026-10-26', label: '  ', active: true }]) {
      expect((await send(app, 'POST', '/api/admin/days-off', { cookie: admin, body })).status).toBe(400);
    }
    for (const period of ['2026-11', 'bad', '0000-01']) expect((await send(app, 'GET', `/api/pay/calendar?period=${period}`, { cookie: worker })).status).toBe(400);
    const feb = await json<PayCalendar>(await send(app, 'GET', '/api/pay/calendar?period=2024-02', { cookie: worker }));
    expect(feb.days).toHaveLength(29);
    expect(feb.days.every((d) => d.gross === 0)).toBe(true);
  });
});
