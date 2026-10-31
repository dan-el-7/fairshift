import { describe, expect, it } from 'vitest';
import type { PaymentSummary } from '../../../src/shared/payments';
import type { Payslip } from '../../../src/shared/types';
import { ADMIN_SKYLINE, WORKER_GREENFIELD, WORKER_SKYLINE, json, login, makeTestApp, send } from './harness';

describe('payment reconciliation', () => {
  it('keeps no recorded payment distinct from zero and calculates expected pay on the server', async () => {
    const t = await makeTestApp(); const cookie = await login(t, WORKER_SKYLINE);
    const [summary, slip] = await Promise.all([
      send(t, 'GET', '/api/payments/me?period=2026-10', { cookie }).then(json<PaymentSummary>),
      send(t, 'GET', '/api/pay/me?period=2026-10', { cookie }).then(json<Payslip>),
    ]);
    expect(summary.expected).toBe(slip.net); expect(summary.hasRecordedPayment).toBe(false);
    expect(summary.recorded).toBe(0); expect(summary.outstanding).toBe(slip.net); expect(summary.records).toEqual([]);
  });

  it('appends an employer payment and a one-time worker confirmation with CAS versions', async () => {
    const t = await makeTestApp(); const admin = await login(t, ADMIN_SKYLINE); const worker = await login(t, WORKER_SKYLINE);
    const slip = await json<Payslip>(await send(t, 'GET', '/api/pay/me?period=2026-10', { cookie: worker }));
    const created = await send(t, 'POST', '/api/admin/payments', { cookie: admin, body: { workerId: WORKER_SKYLINE, period: '2026-10', amount: 500_000, date: '2026-10-27', reference: 'cash-1', expectedVersion: 0 } });
    expect(created.status).toBe(201);
    const record = await json<{ id: string; paidOn: string; recordedAt: string; recordedBy: string }>(created);
    expect(record.paidOn).toBe('2026-10-27'); expect(record.recordedAt).toBe(t.clock.now.toISOString()); expect(record.recordedBy).toBeTruthy();
    const summary = await json<PaymentSummary>(await send(t, 'GET', '/api/payments/me?period=2026-10', { cookie: worker }));
    expect(summary.hasRecordedPayment).toBe(true); expect(summary.recorded).toBe(500_000); expect(summary.ledgerVersion).toBe(1);
    const confirmation = await send(t, 'POST', '/api/payments/me/confirm', { cookie: worker, body: { recordId: record.id, decision: 'different_amount', receivedAmount: 450_000, reason: 'Short by five hundred rupees', expectedVersion: 1 } });
    expect(confirmation.status).toBe(201);
    expect((await send(t, 'POST', '/api/payments/me/confirm', { cookie: worker, body: { recordId: record.id, decision: 'received', expectedVersion: 2 } })).status).toBe(409);
    expect((await send(t, 'POST', '/api/admin/payments', { cookie: admin, body: { workerId: WORKER_SKYLINE, period: '2026-10', amount: 100, date: '2026-10-27', expectedVersion: 1 } })).status).toBe(409);
    const after = await json<PaymentSummary>(await send(t, 'GET', '/api/payments/me?period=2026-10', { cookie: worker }));
    expect(after.records[0]?.confirmation?.decision).toBe('different_amount');
    expect(after.records[0]?.confirmation?.receivedAmount).toBe(450_000);
    expect(after.records[0]?.confirmation?.reason).toBe('Short by five hundred rupees');
    expect(after.ledgerVersion).toBe(2);
    const unchanged = await json<Payslip>(await send(t, 'GET', '/api/pay/me?period=2026-10', { cookie: worker }));
    expect(unchanged.net).toBe(slip.net);
  });

  it('records a zero amount distinctly from the absence of any record', async () => {
    const t = await makeTestApp(); const admin = await login(t, ADMIN_SKYLINE); const worker = await login(t, WORKER_SKYLINE);
    const before = await json<PaymentSummary>(await send(t, 'GET', '/api/payments/me?period=2026-10', { cookie: worker }));
    expect(before.hasRecordedPayment).toBe(false);
    expect((await send(t, 'POST', '/api/admin/payments', { cookie: admin, body: { workerId: WORKER_SKYLINE, period: '2026-10', amount: 0, date: '2026-10-27', expectedVersion: 0 } })).status).toBe(201);
    const after = await json<PaymentSummary>(await send(t, 'GET', '/api/payments/me?period=2026-10', { cookie: worker }));
    expect(after.hasRecordedPayment).toBe(true); expect(after.recorded).toBe(0); expect(after.outstanding).toBe(after.expected);
  });

  it('scopes admin writes to their site and rejects future or out-of-range records', async () => {
    const t = await makeTestApp(); const admin = await login(t, ADMIN_SKYLINE);
    const base = { period: '2026-10', amount: 100, date: '2026-10-27', expectedVersion: 0 };
    expect((await send(t, 'POST', '/api/admin/payments', { cookie: admin, body: { ...base, workerId: WORKER_GREENFIELD } })).status).toBe(404);
    expect((await send(t, 'POST', '/api/admin/payments', { cookie: admin, body: { ...base, workerId: WORKER_SKYLINE, date: '2026-10-28' } })).status).toBe(400);
    expect((await send(t, 'POST', '/api/admin/payments', { cookie: admin, body: { ...base, workerId: WORKER_SKYLINE, amount: 100_000_001 } })).status).toBe(400);
  });
});
