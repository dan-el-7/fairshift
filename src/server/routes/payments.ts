import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import type { PaymentConfirmation, PaymentLedger, PaymentRecord } from '../../shared/payments';
import type { Deps } from '../app';
import { istDay } from '../domain/time';
import { requireRole, type AppEnv } from '../middleware/auth';
import { emptyPaymentLedger, paymentSummary } from '../services/payments';
import { addDays } from '../domain/time';
import { sessionContext } from '../services/people';
import { parseBody, parseQuery } from './http';

const periodSchema = z.string().regex(/^(19|20)\d{2}-(0[1-9]|1[0-2])$/);
const querySchema = z.object({ period: periodSchema });
const recordSchema = z.object({ workerId: z.string().min(1).max(100), period: periodSchema, amount: z.number().int().nonnegative().max(100_000_000), date: z.iso.date(), reference: z.string().trim().max(100).optional(), note: z.string().trim().max(500).optional(), expectedVersion: z.number().int().nonnegative() });
const confirmSchema = z.object({ recordId: z.uuid(), decision: z.enum(['received', 'not_received', 'different_amount']), receivedAmount: z.number().int().nonnegative().max(100_000_000).optional(), reason: z.string().trim().max(500).optional(), expectedVersion: z.number().int().nonnegative() }).superRefine((v, ctx) => {
  if (v.decision === 'different_amount' && v.receivedAmount === undefined) ctx.addIssue({ code: 'custom', message: 'receivedAmount required for different_amount' });
  if (v.decision !== 'different_amount' && v.receivedAmount !== undefined) ctx.addIssue({ code: 'custom', message: 'receivedAmount only applies to different_amount' });
  if (v.decision !== 'received' && (!v.reason || v.reason.length < 3)) ctx.addIssue({ code: 'custom', message: 'reason required' });
});

export function paymentRoutes(deps: Deps): Hono<AppEnv> {
  const api = new Hono<AppEnv>();
  api.get('/payments/me', requireRole('worker'), async (c) => {
    const ctx = await sessionContext(c, deps.repo); if (!ctx) return c.json({ error: 'sign in required' }, 401);
    const query = parseQuery(c, querySchema); if (query instanceof Response) return query;
    if (query.period > istDay(deps.now()).slice(0, 7)) return c.json({ error: 'period is in the future' }, 400);
    return c.json(await paymentSummary(deps.repo, ctx.worker, ctx.cfg, query.period, deps.now()));
  });
  api.post('/payments/me/confirm', requireRole('worker'), async (c) => {
    const body = await parseBody(c, confirmSchema); if (body instanceof Response) return body;
    const ctx = await sessionContext(c, deps.repo); if (!ctx) return c.json({ error: 'sign in required' }, 401);
    const ledgers = await deps.repo.listPaymentLedgers(ctx.site.id);
    const ledger = ledgers.find((item) => item.workerId === ctx.worker.id) ?? emptyPaymentLedger(ctx.worker.id, ctx.site.id);
    if (body.expectedVersion !== ledger.version) return c.json({ error: 'records changed; reload and retry' }, 409);
    const record = ledger.records.find((item) => item.id === body.recordId);
    if (!record) return c.json({ error: 'payment record not found' }, 404);
    if (ledger.confirmations.some((item) => item.recordId === record.id)) return c.json({ error: 'payment already confirmed' }, 409);
    const confirmation: PaymentConfirmation = { id: randomUUID(), recordId: record.id, decision: body.decision, ...(body.receivedAmount !== undefined ? { receivedAmount: body.receivedAmount } : {}), ...(body.reason ? { reason: body.reason } : {}), confirmedAt: deps.now().toISOString() };
    const saved = await deps.repo.savePaymentLedger({ ...ledger, version: ledger.version + 1, confirmations: [...ledger.confirmations, confirmation] }, ledger.version);
    return saved ? c.json(confirmation, 201) : c.json({ error: 'records changed; reload and retry' }, 409);
  });
  api.get('/admin/payments', requireRole('admin'), async (c) => {
    const ctx = await sessionContext(c, deps.repo); if (!ctx) return c.json({ error: 'sign in required' }, 401);
    const [workers, ledgers] = await Promise.all([deps.repo.listWorkers(ctx.site.id), deps.repo.listPaymentLedgers(ctx.site.id)]);
    const today = istDay(deps.now()), period = c.req.query('period') ?? today.slice(0, 7);
    if (!periodSchema.safeParse(period).success || period > today.slice(0, 7)) return c.json({ error: 'invalid period' }, 400);
    const summaries = await Promise.all(workers.filter((worker) => worker.role === 'worker').map(async (worker) => ({ workerId: worker.id, workerName: worker.name, ...(await paymentSummary(deps.repo, worker, ctx.cfg, period, deps.now())) })));
    return c.json({ period, summaries, ledgerVersions: Object.fromEntries(ledgers.map((entry) => [entry.workerId, entry.version])) });
  });
  api.post('/admin/payments', requireRole('admin'), async (c) => {
    const body = await parseBody(c, recordSchema); if (body instanceof Response) return body;
    const ctx = await sessionContext(c, deps.repo); if (!ctx) return c.json({ error: 'sign in required' }, 401);
    const today = istDay(deps.now());
    if (body.period > today.slice(0, 7) || body.date > today || body.period > body.date.slice(0, 7)) return c.json({ error: 'payment period and date must not be in the future' }, 400);
    if (body.date < addDays(today, -183)) return c.json({ error: 'payment date must be within the last six months' }, 400);
    const worker = await deps.repo.getWorker(body.workerId);
    if (worker?.role !== 'worker' || worker.siteId !== ctx.site.id) return c.json({ error: 'worker not found' }, 404);
    const ledger = (await deps.repo.listPaymentLedgers(ctx.site.id)).find((item) => item.workerId === worker.id) ?? emptyPaymentLedger(worker.id, ctx.site.id);
    if (body.expectedVersion !== ledger.version) return c.json({ error: 'records changed; reload and retry' }, 409);
    const record: PaymentRecord = { id: randomUUID(), period: body.period, amount: body.amount, paidOn: body.date, recordedAt: deps.now().toISOString(), recordedBy: ctx.worker.name, ...(body.reference ? { reference: body.reference } : {}), ...(body.note ? { note: body.note } : {}) };
    const next: PaymentLedger = { ...ledger, version: ledger.version + 1, records: [...ledger.records, record] };
    const saved = await deps.repo.savePaymentLedger(next, ledger.version);
    return saved ? c.json(record, 201) : c.json({ error: 'records changed; reload and retry' }, 409);
  });
  return api;
}
