import { describe, expect, it } from 'vitest';
import type { CorrectionRequest, PayCalendar, Payslip, Shift } from '../../../src/shared/types';
import type { AttendanceMe, AdminOverview } from '../../../src/shared/api';
import { ADMIN_GREENFIELD, ADMIN_SKYLINE, WORKER_SKYLINE, json, login, makeTestApp, send } from './harness';

describe('reviewed attendance and pay corrections', () => {
  it('returns only the next three active own-site days off, using the server date', async () => {
    const app = await makeTestApp(), worker = await login(app, WORKER_SKYLINE);
    for (const day of ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30']) await app.repo.saveDayOff({ siteId: 'site-skyline', day, label: 'Site notice', active: true });
    await app.repo.saveDayOff({ siteId: 'site-greenfield', day: '2026-10-27', label: 'Other site', active: true });
    const data = await json<{ today: string; days: { day: string; label: string }[] }>(await send(app, 'GET', '/api/schedule/me', { cookie: worker }));
    expect(data.today).toBe('2026-10-27');
    expect(data.days.map((d) => d.day)).toEqual(['2026-10-27', '2026-10-28', '2026-10-29']);
    expect(data.days.every((d) => d.label === 'Site notice')).toBe(true);
  });
  it('recalculates attendance, payroll, calendar and admin totals after approval while preserving the raw shift and original snapshot', async () => {
    const app = await makeTestApp();
    const worker = await login(app, WORKER_SKYLINE), admin = await login(app, ADMIN_SKYLINE);
    const original: Shift = { id: 'correct-this', workerId: WORKER_SKYLINE, siteId: 'site-skyline', method: 'qr', checkIn: '2026-10-05T03:30:00.000Z', checkOut: '2026-10-05T11:30:00.000Z' };
    await app.repo.saveShift(original);
    const before = await json<Payslip>(await send(app, 'GET', '/api/pay/me', { cookie: worker }));
    const response = await send(app, 'POST', '/api/corrections/me', { cookie: worker, body: { kind: 'shift', day: '2026-10-05', shiftId: original.id, checkIn: original.checkIn, checkOut: '2026-10-05T13:30:00.000Z', reason: 'Worked two more hours' } });
    expect(response.status).toBe(201);
    const request = await json<CorrectionRequest>(response);
    expect(request.originalShift).toEqual(original);
    expect(await json(await send(app, 'GET', '/api/pay/me', { cookie: worker }))).toEqual(before);
    const reviewed = await send(app, 'POST', `/api/admin/corrections/${request.id}`, { cookie: admin, body: { status: 'approved', reason: 'Checked the site register' } });
    expect(reviewed.status).toBe(200);
    const after = await json<Payslip>(await send(app, 'GET', '/api/pay/me', { cookie: worker }));
    expect(after.summary.overtimeHours).toBe(before.summary.overtimeHours + 2);
    expect(after.gross).toBe(before.gross + 37500);
    const calendar = await json<PayCalendar>(await send(app, 'GET', '/api/pay/calendar', { cookie: worker }));
    expect(calendar.days.find((d) => d.day === '2026-10-05')?.summary.hours).toBe(10);
    expect((await app.repo.listShifts({ workerId: WORKER_SKYLINE })).find((s) => s.id === original.id)).toEqual(original);
    const history = await json<{ requests: CorrectionRequest[] }>(await send(app, 'GET', '/api/corrections/me', { cookie: worker }));
    expect(history.requests[0]).toMatchObject({ status: 'approved', reviewer: 'Priya Raman', originalShift: original });
    expect((await send(app, 'POST', `/api/admin/corrections/${request.id}`, { cookie: admin, body: { status: 'rejected', reason: 'Second review attempt' } })).status).toBe(409);
    // A recent missing shift also appears in attendance and workforce reads, not only pay.
    const missing = await json<CorrectionRequest>(await send(app, 'POST', '/api/corrections/me', { cookie: worker, body: { kind: 'shift', day: '2026-10-27', checkIn: '2026-10-27T01:00:00.000Z', checkOut: '2026-10-27T02:00:00.000Z', reason: 'Morning delivery was missing' } }));
    await send(app, 'POST', `/api/admin/corrections/${missing.id}`, { cookie: admin, body: { status: 'approved', reason: 'Delivery record verified' } });
    const attendance = await json<AttendanceMe>(await send(app, 'GET', '/api/attendance/me', { cookie: worker }));
    expect(attendance.recent.some((s) => s.id === `correction-${missing.id}` && s.method === 'correction')).toBe(true);
    const overview = await json<AdminOverview>(await send(app, 'GET', '/api/admin/overview', { cookie: admin }));
    expect(overview.attendance14d.at(-1)?.present).toBeGreaterThanOrEqual(1);
  });

  it('applies a net pay adjustment once, keeps rejection unchanged and retains signed amounts in history', async () => {
    const app = await makeTestApp();
    const worker = await login(app, WORKER_SKYLINE), admin = await login(app, ADMIN_SKYLINE);
    const before = await json<Payslip>(await send(app, 'GET', '/api/pay/me', { cookie: worker }));
    const create = () => send(app, 'POST', '/api/corrections/me', { cookie: worker, body: { kind: 'pay', day: '2026-10-20', amount: -12345, reason: 'Advance amount was understated' } });
    const request = await json<CorrectionRequest>(await create());
    expect((await create()).status).toBe(409);
    const reviews = await Promise.all(['approved', 'rejected'].map((status) => send(app, 'POST', `/api/admin/corrections/${request.id}`, { cookie: admin, body: { status, reason: 'Verified with the worker' } })));
    expect(reviews.map((r) => r.status).sort()).toEqual([200, 409]);
    const record = await json<CorrectionRequest>(reviews.find((r) => r.status === 200)!);
    const after = await json<Payslip>(await send(app, 'GET', '/api/pay/me', { cookie: worker }));
    expect(after.net).toBe(before.net + (record.status === 'approved' ? -12345 : 0));
    const calendar = await json<PayCalendar>(await send(app, 'GET', '/api/pay/calendar', { cookie: worker }));
    expect(calendar.days.reduce((sum, d) => sum + d.net, calendar.monthlyAdjustment)).toBe(after.net);
    expect(after.gross).toBe(before.gross);
    expect(after.deductions).toBe(before.deductions);
  });

  it('rejects overlap, future work, foreign shifts, zero/fractional money and unauthorised access', async () => {
    const app = await makeTestApp();
    const worker = await login(app, WORKER_SKYLINE), admin = await login(app, ADMIN_GREENFIELD);
    const own = (await app.repo.listShifts({ workerId: WORKER_SKYLINE })).find((s) => s.checkIn.startsWith('2026-10-26'))!;
    const bodies = [
      { kind: 'pay', day: '2026-10-20', amount: 0, reason: 'Invalid adjustment' },
      { kind: 'pay', day: '2026-10-20', amount: .5, reason: 'Invalid adjustment' },
      { kind: 'pay', day: '2026-10-28', amount: 500, reason: 'Future work' },
      { kind: 'shift', day: '2026-10-26', checkIn: own.checkIn, checkOut: own.checkOut, reason: 'Overlap recorded work' },
      { kind: 'shift', day: '2026-10-26', shiftId: 'somebody-else', checkIn: own.checkIn, checkOut: own.checkOut, reason: 'Foreign shift id' },
    ];
    for (const body of bodies) expect((await send(app, 'POST', '/api/corrections/me', { cookie: worker, body })).status).toBe(400);
    expect((await send(app, 'GET', '/api/corrections/me')).status).toBe(401);
    expect((await send(app, 'GET', '/api/admin/corrections', { cookie: worker })).status).toBe(403);
    const pending = await json<CorrectionRequest>(await send(app, 'POST', '/api/corrections/me', { cookie: worker, body: { kind: 'pay', day: '2026-10-20', amount: 500, reason: 'Missing allowance' } }));
    expect((await send(app, 'POST', `/api/admin/corrections/${pending.id}`, { cookie: admin, body: { status: 'approved', reason: 'Wrong site review' } })).status).toBe(404);
    expect(await json(await send(app, 'GET', '/api/admin/corrections', { cookie: admin }))).toEqual([]);
  });

  it('does not approve a proposal whose original shift changed after submission', async () => {
    const app = await makeTestApp(), worker = await login(app, WORKER_SKYLINE), admin = await login(app, ADMIN_SKYLINE);
    const original: Shift = { id: 'stale-original', workerId: WORKER_SKYLINE, siteId: 'site-skyline', method: 'qr', checkIn: '2026-10-05T03:30:00.000Z', checkOut: '2026-10-05T11:30:00.000Z' };
    await app.repo.saveShift(original);
    const request = await json<CorrectionRequest>(await send(app, 'POST', '/api/corrections/me', { cookie: worker, body: { kind: 'shift', day: '2026-10-05', shiftId: original.id, checkIn: original.checkIn, checkOut: '2026-10-05T12:30:00.000Z', reason: 'Proposed an extra hour' } }));
    await app.repo.saveShift({ ...original, checkOut: '2026-10-05T12:00:00.000Z' });
    expect((await send(app, 'POST', `/api/admin/corrections/${request.id}`, { cookie: admin, body: { status: 'approved', reason: 'Should fail as stale' } })).status).toBe(409);
    expect((await send(app, 'POST', `/api/admin/corrections/${request.id}`, { cookie: admin, body: { status: 'rejected', reason: 'Please resubmit current times' } })).status).toBe(200);
  });
});
