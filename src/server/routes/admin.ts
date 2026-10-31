import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AdminFeedback, ReportAdmin } from '../../shared/api';
import type { PassportEntry, Report, ReportStatus, Severity } from '../../shared/types';
import type { Deps } from '../app';
import { aggregateFeedback, redactPII } from '../domain/anonymity';
import { qrToken } from '../domain/qrToken';
import { istDay } from '../domain/time';
import { requireRole, type AppEnv } from '../middleware/auth';
import { sessionContext } from '../services/people';
import { isOverdue } from '../services/reports';
import { atRiskWorkers, buildWorkforce, highRiskCount } from '../services/workforce';
import { jsonError, parseBody } from './http';

const REPORT_STATUSES: [ReportStatus, ...ReportStatus[]] = ['open', 'acknowledged', 'in_progress', 'resolved'];
const MIN_FEEDBACK_GROUP = 5;
function reportView({ reporterSecretHash: _private, ...report }: Report, today: string): ReportAdmin {
  return { ...report, overdue: isOverdue(report, today) };
}
const dayOffSchema = z.object({
  day: z.iso.date(),
  label: z.string().trim().min(1).max(100),
  active: z.boolean(),
});

const reportPatchSchema = z.object({
  status: z.enum(REPORT_STATUSES),
  note: z.string().trim().max(500).optional(),
  expectedVersion: z.number().int().nonnegative().optional(),
});

const passportSchema = z.object({
  workerId: z.string().min(1).max(64),
  kind: z.enum(['training', 'certification', 'experience']),
  title: z.string().trim().min(1).max(160),
  hours: z.number().min(0).max(10_000).optional(),
});

/** Site schedule notices, guarded by the parent admin router. */
function scheduleRoutes({ repo }: Deps): Hono<AppEnv> {
  const api = new Hono<AppEnv>();
  api.get('/days-off', async (c) => {
    const ctx = await sessionContext(c, repo);
    if (!ctx) return c.json({ error: 'sign in required' }, 401);
    return c.json((await repo.listDaysOff(ctx.site.id)).sort((a, b) => a.day.localeCompare(b.day)));
  });

  api.post('/days-off', async (c) => {
    const body = await parseBody(c, dayOffSchema);
    if (body instanceof Response) return body;
    const ctx = await sessionContext(c, repo);
    if (!ctx) return c.json({ error: 'sign in required' }, 401);
    const notice = { ...body, siteId: ctx.site.id };
    await repo.saveDayOff(notice);
    return c.json(notice);
  });
  return api;
}

/** Admin dashboard, reports, feedback, kiosk QR and passports. Admin role only, scoped to own site. */
export function adminRoutes(deps: Deps): Hono<AppEnv> {
  const api = new Hono<AppEnv>();
  const { repo, config } = deps;
  api.use('/admin/*', requireRole('admin'));
  api.route('/admin', scheduleRoutes(deps));

  api.get('/admin/overview', async (c) => {
    const ctx = await sessionContext(c, repo);
    if (!ctx) return c.json({ error: 'sign in required' }, 401);
    const now = deps.now();
    const today = istDay(now);
    const workforce = await buildWorkforce(repo, ctx.site, now);
    const reports = await repo.listReports(ctx.site.id);

    const reportsBySeverity: Record<Severity, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    const reportsByStatus: Record<ReportStatus, number> = { open: 0, acknowledged: 0, in_progress: 0, resolved: 0 };
    for (const r of reports) {
      reportsBySeverity[r.severity] += 1;
      reportsByStatus[r.status] += 1;
    }

    return c.json({
      site: ctx.site,
      kpis: {
        workers: workforce.summaries.length,
        presentToday: workforce.presentToday,
        overtimeHours14d: workforce.overtimeHours14d,
        openReports: reports.filter((r) => r.status !== 'resolved').length,
        overdueReports: reports.filter((r) => isOverdue(r, today)).length,
        fatigueAlerts: workforce.fatigueAlerts,
        highRiskWorkers: highRiskCount(workforce.summaries),
      },
      attendance14d: workforce.attendance14d,
      reportsBySeverity,
      reportsByStatus,
      atRisk: atRiskWorkers(workforce.summaries),
    });
  });

  api.get('/admin/reports', async (c) => {
    const ctx = await sessionContext(c, repo);
    if (!ctx) return c.json({ error: 'sign in required' }, 401);
    const today = istDay(deps.now());
    const reports = await repo.listReports(ctx.site.id);
    const view: ReportAdmin[] = reports
      .map((r) => reportView(r, today))
      .sort((a, b) => b.createdDay.localeCompare(a.createdDay) || a.id.localeCompare(b.id));
    return c.json(view);
  });

  api.patch('/admin/reports/:id', async (c) => {
    const body = await parseBody(c, reportPatchSchema);
    if (body instanceof Response) return body;
    const ctx = await sessionContext(c, repo);
    if (!ctx) return c.json({ error: 'sign in required' }, 401);

    const existing = await repo.getReport(c.req.param('id'));
    if (existing?.siteId !== ctx.site.id) return jsonError(c, 404, 'report not found');
    const version = existing.version ?? 0;
    if (body.expectedVersion !== undefined && body.expectedVersion !== version) return jsonError(c, 409, 'report has changed');

    const today = istDay(deps.now());
    const update: Report['updates'][number] = { status: body.status, day: today };
    if (body.note !== undefined && body.note.length > 0) update.note = redactPII(body.note);
    const saved: Report = { ...existing, status: body.status, version: version + 1, fixResponse: existing.status !== 'resolved' && body.status === 'resolved' ? undefined : existing.fixResponse, updates: [...existing.updates, { ...update, actor: 'admin' }] };
    if (!(await repo.compareAndSaveReport(saved, version))) return jsonError(c, 409, 'report has changed');

    const view = reportView(saved, today);
    return c.json(view);
  });

  api.get('/admin/feedback', async (c) => {
    const ctx = await sessionContext(c, repo);
    if (!ctx) return c.json({ error: 'sign in required' }, 401);
    const responses = await repo.listFeedback(ctx.site.id);
    const aggregate = aggregateFeedback(responses, MIN_FEEDBACK_GROUP);
    const body: AdminFeedback = aggregate ?? { insufficient: true, count: responses.length };
    return c.json(body);
  });

  api.get('/admin/qr', async (c) => {
    const ctx = await sessionContext(c, repo);
    if (!ctx) return c.json({ error: 'sign in required' }, 401);
    const now = deps.now();
    const epochSec = Math.floor(now.getTime() / 1000);
    return c.json({
      token: qrToken(ctx.site.id, config.sessionSecret, now),
      expiresInSec: 60 - (epochSec % 60),
    });
  });

  api.post('/admin/passport', async (c) => {
    const body = await parseBody(c, passportSchema);
    if (body instanceof Response) return body;
    const ctx = await sessionContext(c, repo);
    if (!ctx) return c.json({ error: 'sign in required' }, 401);

    const worker = await repo.getWorker(body.workerId);
    if (worker?.siteId !== ctx.site.id || worker.role !== 'worker') {
      return jsonError(c, 404, 'worker not found');
    }

    const entry: PassportEntry = {
      id: randomUUID(),
      workerId: worker.id,
      kind: body.kind,
      title: body.title,
      issuer: ctx.site.name,
      issuedOn: istDay(deps.now()),
      industry: ctx.site.industry,
    };
    if (body.hours !== undefined) entry.hours = body.hours;
    await repo.savePassport(entry);
    return c.json(entry);
  });

  api.get('/admin/workers', async (c) => {
    const ctx = await sessionContext(c, repo);
    if (!ctx) return c.json({ error: 'sign in required' }, 401);
    const workforce = await buildWorkforce(repo, ctx.site, deps.now());
    return c.json(workforce.summaries);
  });

  return api;
}
