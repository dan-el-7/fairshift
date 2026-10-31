import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import type { CorrectionLedger, CorrectionRequest } from '../../shared/types';
import type { Deps } from '../app';
import { istDay } from '../domain/time';
import { requireRole, type AppEnv } from '../middleware/auth';
import { approvalProblem, approvedRevision, effectiveWork, shiftProposalProblem } from '../services/corrections';
import { sessionContext } from '../services/people';
import { parseBody } from './http';

const common = { day: z.iso.date(), reason: z.string().trim().min(5).max(500) };
const proposal = z.discriminatedUnion('kind', [
  z.object({ ...common, kind: z.literal('shift'), shiftId: z.string().min(1).max(100).optional(), checkIn: z.iso.datetime(), checkOut: z.iso.datetime() }),
  z.object({ ...common, kind: z.literal('pay'), amount: z.number().int().min(-10_000_000).max(10_000_000).refine((n) => n !== 0) }),
]);
const decision = z.object({ status: z.enum(['approved', 'rejected']), reason: z.string().trim().min(5).max(500) });

function emptyLedger(workerId: string, siteId: string): CorrectionLedger {
  return { workerId, siteId, version: 0, requests: [] };
}

export function correctionRoutes(deps: Deps): Hono<AppEnv> {
  const api = new Hono<AppEnv>();
  api.get('/corrections/me', requireRole('worker'), async (c) => {
    const ctx = await sessionContext(c, deps.repo);
    if (!ctx) return c.json({ error: 'sign in required' }, 401);
    const work = await effectiveWork(deps.repo, ctx.site.id, ctx.worker.id);
    const requests = work.ledgers[0]?.requests ?? [];
    return c.json({ requests: requests.slice().reverse(), shifts: work.shifts });
  });
  api.post('/corrections/me', requireRole('worker'), async (c) => {
    const body = await parseBody(c, proposal);
    if (body instanceof Response) return body;
    const ctx = await sessionContext(c, deps.repo);
    if (!ctx) return c.json({ error: 'sign in required' }, 401);
    const now = deps.now(), today = istDay(now);
    const earliest = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 6, 1)).toISOString().slice(0, 10);
    if (body.day > today || body.day < earliest || body.day < ctx.worker.joinedOn) return c.json({ error: 'choose a date in the last six pay months, after joining and up to today' }, 400);
    const work = await effectiveWork(deps.repo, ctx.site.id, ctx.worker.id);
    const ledger = work.ledgers[0] ?? emptyLedger(ctx.worker.id, ctx.site.id);
    if (ledger.requests.some((r) => r.day === body.day && r.status === 'pending')) return c.json({ error: 'a request for this day is already pending' }, 409);
    if (body.kind === 'shift') {
      const problem = shiftProposalProblem(body, work.shifts, now);
      if (problem) return c.json({ error: problem }, 400);
    }
    const request: CorrectionRequest = { ...body, id: randomUUID(), status: 'pending', createdAt: now.toISOString(), basedOn: approvedRevision(ledger, body.day) };
    if (body.kind === 'shift') {
      request.checkIn = new Date(body.checkIn).toISOString();
      request.checkOut = new Date(body.checkOut).toISOString();
    }
    if (body.kind === 'shift' && body.shiftId) request.originalShift = work.shifts.find((s) => s.id === body.shiftId);
    const saved = await deps.repo.saveCorrectionLedger({ ...ledger, version: ledger.version + 1, requests: [...ledger.requests, request] }, ledger.version);
    return saved ? c.json(request, 201) : c.json({ error: 'records changed; reload and retry' }, 409);
  });
  api.get('/admin/corrections', requireRole('admin'), async (c) => {
    const ctx = await sessionContext(c, deps.repo);
    if (!ctx) return c.json({ error: 'sign in required' }, 401);
    const [ledgers, workers] = await Promise.all([deps.repo.listCorrectionLedgers(ctx.site.id), deps.repo.listWorkers(ctx.site.id)]);
    return c.json(ledgers.flatMap((l) => l.requests.map((r) => ({ ...r, workerId: l.workerId, workerName: workers.find((w) => w.id === l.workerId)?.name ?? l.workerId }))).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  });
  api.post('/admin/corrections/:id', requireRole('admin'), async (c) => {
    const body = await parseBody(c, decision);
    if (body instanceof Response) return body;
    const ctx = await sessionContext(c, deps.repo);
    if (!ctx) return c.json({ error: 'sign in required' }, 401);
    const ledgers = await deps.repo.listCorrectionLedgers(ctx.site.id);
    const ledger = ledgers.find((l) => l.requests.some((r) => r.id === c.req.param('id')));
    const request = ledger?.requests.find((r) => r.id === c.req.param('id'));
    if (!ledger || !request) return c.json({ error: 'request not found' }, 404);
    if (request.status !== 'pending') return c.json({ error: 'already reviewed' }, 409);
    if (body.status === 'approved') {
      const problem = await approvalProblem(deps.repo, ledger, request, deps.now());
      if (problem) return c.json({ error: problem }, 409);
    }
    const reviewed: CorrectionRequest = { ...request, status: body.status, reviewReason: body.reason, reviewedAt: deps.now().toISOString(), reviewer: ctx.worker.name };
    const saved = await deps.repo.saveCorrectionLedger({ ...ledger, version: ledger.version + 1, requests: ledger.requests.map((r) => r.id === request.id ? reviewed : r) }, ledger.version);
    return saved ? c.json(reviewed) : c.json({ error: 'records changed; reload and retry' }, 409);
  });
  api.get('/schedule/me', requireRole('worker'), async (c) => {
    const ctx = await sessionContext(c, deps.repo);
    if (!ctx) return c.json({ error: 'sign in required' }, 401);
    const today = istDay(deps.now());
    const days = (await deps.repo.listDaysOff(ctx.site.id)).filter((d) => d.day >= today).sort((a, b) => a.day.localeCompare(b.day)).slice(0, 3);
    return c.json({ today, days });
  });
  return api;
}
