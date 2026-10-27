import { describe, expect, it } from 'vitest';
import type { Payslip } from '../../../src/shared/types';
import { WORKER_GREENFIELD, WORKER_SKYLINE, json, login, makeTestApp, send } from './harness';

describe('GET /api/pay/me', () => {
  it('returns a daily-wage payslip for the current month, counting only days up to today', async () => {
    const t = await makeTestApp();
    const cookie = await login(t, WORKER_SKYLINE);
    const res = await send(t, 'GET', '/api/pay/me', { cookie });
    expect(res.status).toBe(200);
    const slip = await json<Payslip>(res);

    // 1-27 Oct 2026 has 4 Sundays, so 23 Mon-Sat days up to and including today (27 Oct, IST).
    expect(slip.period.id).toBe('2026-10');
    expect(slip.period.workingDays).toBe(23);
    expect(slip.industry).toBe('construction');

    expect(slip.lines.map((l) => l.key)).toEqual([
      'pay.base',
      'pay.overtime',
      'pay.night',
      'pay.pf',
      'pay.esi',
      'pay.advance',
    ]);
    const base = slip.lines.find((l) => l.key === 'pay.base');
    expect(base?.amount).toBe(slip.summary.daysWorked * 75_000);
    expect(base?.params.rate).toBe(75_000);

    const earnings = slip.lines.filter((l) => l.kind === 'earning').reduce((s, l) => s + l.amount, 0);
    const deductions = slip.lines.filter((l) => l.kind === 'deduction').reduce((s, l) => s + l.amount, 0);
    expect(slip.gross).toBe(earnings);
    expect(slip.deductions).toBe(deductions);
    expect(slip.net).toBe(slip.gross - slip.deductions);
  });

  it('applies the advance recorded on the worker record', async () => {
    const t = await makeTestApp();
    const worker = await t.repo.getWorker(WORKER_SKYLINE);
    if (!worker) throw new Error('seed missing worker');
    await t.repo.saveWorker({ ...worker, advanceThisPeriod: 50_000 });
    const cookie = await login(t, WORKER_SKYLINE);
    const slip = await json<Payslip>(await send(t, 'GET', '/api/pay/me', { cookie }));
    expect(slip.lines.find((l) => l.key === 'pay.advance')?.amount).toBe(50_000);
  });

  it('computes a monthly salary with absences for a college worker', async () => {
    const t = await makeTestApp();
    const cookie = await login(t, WORKER_GREENFIELD);
    const slip = await json<Payslip>(await send(t, 'GET', '/api/pay/me', { cookie }));
    expect(slip.industry).toBe('college');
    expect(slip.period.workingDays).toBe(23);

    const absentDays = Math.max(0, 23 - slip.summary.daysWorked);
    const expectedBase = Math.max(0, Math.round(1_800_000 - (absentDays * 1_800_000) / 26));
    expect(slip.lines.find((l) => l.key === 'pay.base')?.amount).toBe(expectedBase);
  });

  it('uses the full Mon-Sat count for a past month', async () => {
    const t = await makeTestApp();
    const cookie = await login(t, WORKER_SKYLINE);
    const slip = await json<Payslip>(await send(t, 'GET', '/api/pay/me?period=2026-09', { cookie }));
    // September 2026 has 4 Sundays in 30 days, so 26 working days.
    expect(slip.period.id).toBe('2026-09');
    expect(slip.period.workingDays).toBe(26);
  });

  it('rejects future periods and malformed period values with 400', async () => {
    const t = await makeTestApp();
    const cookie = await login(t, WORKER_SKYLINE);
    expect((await send(t, 'GET', '/api/pay/me?period=2026-11', { cookie })).status).toBe(400);
    expect((await send(t, 'GET', '/api/pay/me?period=October', { cookie })).status).toBe(400);
  });

  it('returns 401 for anonymous requests', async () => {
    const t = await makeTestApp();
    expect((await send(t, 'GET', '/api/pay/me')).status).toBe(401);
  });
});
