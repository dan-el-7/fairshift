import { describe, expect, it } from 'vitest';
import type { AdminOverview, QrResponse, WorkerSummary } from '../../../src/shared/api';
import type { PassportEntry, Report } from '../../../src/shared/types';
import { qrToken } from '../../../src/server/domain/qrToken';
import {
  ADMIN_GREENFIELD,
  ADMIN_SKYLINE,
  FATIGUE_WORKER,
  NOW,
  SESSION_SECRET,
  WORKER_GREENFIELD,
  WORKER_SKYLINE,
  json,
  login,
  makeTestApp,
  send,
} from './harness';

describe('GET /api/admin/overview', () => {
  it('returns KPIs, a 14-day series and at-risk workers for the admin site', async () => {
    const t = await makeTestApp();
    const cookie = await login(t, ADMIN_SKYLINE);
    const res = await send(t, 'GET', '/api/admin/overview', { cookie });
    expect(res.status).toBe(200);
    const view = await json<AdminOverview>(res);

    expect(view.site.id).toBe('site-skyline');
    expect(view.kpis.workers).toBe(5);
    expect(view.kpis.overdueReports).toBeGreaterThan(0);
    expect(view.kpis.fatigueAlerts).toBeGreaterThan(0);
    expect(view.attendance14d).toHaveLength(14);
    expect(view.attendance14d.at(-1)?.day).toBe('2026-10-27');
    expect(view.reportsBySeverity.critical + view.reportsBySeverity.high).toBeGreaterThan(0);
    expect(Object.keys(view.reportsByStatus).sort()).toEqual(['acknowledged', 'in_progress', 'open', 'resolved']);
  });

  it('lists the fatigued worker as at risk, sorted by score', async () => {
    const t = await makeTestApp();
    const cookie = await login(t, ADMIN_SKYLINE);
    const view = await json<AdminOverview>(await send(t, 'GET', '/api/admin/overview', { cookie }));
    const scores = view.atRisk.map((w) => w.quitRisk.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    const fatigued = view.atRisk.find((w) => w.id === FATIGUE_WORKER);
    expect(fatigued?.quitRisk.level).toBe('high');
    expect(view.atRisk.every((w) => w.quitRisk.score >= 30)).toBe(true);
  });

  it('is scoped to the admin site only', async () => {
    const t = await makeTestApp();
    const cookie = await login(t, ADMIN_GREENFIELD);
    const view = await json<AdminOverview>(await send(t, 'GET', '/api/admin/overview', { cookie }));
    expect(view.site.id).toBe('site-greenfield');
    expect(view.kpis.workers).toBe(5);
  });
});

describe('admin reports', () => {
  it('lists only reports for the admin site, with overdue flags', async () => {
    const t = await makeTestApp();
    const cookie = await login(t, ADMIN_SKYLINE);
    const reports = await json<(Report & { overdue: boolean })[]>(
      await send(t, 'GET', '/api/admin/reports', { cookie }),
    );
    expect(reports.length).toBeGreaterThan(0);
    expect(reports.every((r) => r.siteId === 'site-skyline')).toBe(true);
    expect(reports.some((r) => r.overdue)).toBe(true);
  });

  it('PATCH updates status and appends an update entry', async () => {
    const t = await makeTestApp();
    const cookie = await login(t, ADMIN_SKYLINE);
    const reports = await json<Report[]>(await send(t, 'GET', '/api/admin/reports', { cookie }));
    const open = reports.find((r) => r.status === 'open');
    if (!open) throw new Error('seed has no open report');

    const res = await send(t, 'PATCH', `/api/admin/reports/${open.id}`, {
      cookie,
      body: { status: 'in_progress', note: 'Contractor called in' },
    });
    expect(res.status).toBe(200);
    const updated = await json<Report & { overdue: boolean }>(res);
    expect(updated.status).toBe('in_progress');
    expect(updated.updates.length).toBe(open.updates.length + 1);
    expect(updated.updates.at(-1)?.note).toBe('Contractor called in');
  });

  it('PATCH returns 404 for a report on another site', async () => {
    const t = await makeTestApp();
    const greenfieldCookie = await login(t, ADMIN_GREENFIELD);
    const other = (await json<Report[]>(await send(t, 'GET', '/api/admin/reports', { cookie: greenfieldCookie })))[0];
    if (!other) throw new Error('seed has no greenfield report');

    const skylineCookie = await login(t, ADMIN_SKYLINE);
    const res = await send(t, 'PATCH', `/api/admin/reports/${other.id}`, {
      cookie: skylineCookie,
      body: { status: 'resolved' },
    });
    expect(res.status).toBe(404);
  });

  it('PATCH rejects an unknown status with 400', async () => {
    const t = await makeTestApp();
    const cookie = await login(t, ADMIN_SKYLINE);
    const [report] = await json<Report[]>(await send(t, 'GET', '/api/admin/reports', { cookie }));
    if (!report) throw new Error('seed has no reports');
    const res = await send(t, 'PATCH', `/api/admin/reports/${report.id}`, { cookie, body: { status: 'closed' } });
    expect(res.status).toBe(400);
  });
});

describe('admin QR and workers', () => {
  it('issues the current site QR token with an expiry under a minute', async () => {
    const t = await makeTestApp();
    const cookie = await login(t, ADMIN_SKYLINE);
    const qr = await json<QrResponse>(await send(t, 'GET', '/api/admin/qr', { cookie }));
    expect(qr.token).toBe(qrToken('site-skyline', SESSION_SECRET, NOW));
    expect(qr.expiresInSec).toBeGreaterThanOrEqual(1);
    expect(qr.expiresInSec).toBeLessThanOrEqual(60);
  });

  it('lists worker summaries for the site without admins', async () => {
    const t = await makeTestApp();
    const cookie = await login(t, ADMIN_SKYLINE);
    const workers = await json<WorkerSummary[]>(await send(t, 'GET', '/api/admin/workers', { cookie }));
    expect(workers).toHaveLength(5);
    expect(workers.map((w) => w.id)).not.toContain(ADMIN_SKYLINE);
    expect(workers[0]?.quitRisk).toHaveProperty('factors');
  });
});

describe('admin passport entries', () => {
  it('issues a passport entry for a worker on the same site', async () => {
    const t = await makeTestApp();
    const cookie = await login(t, ADMIN_SKYLINE);
    const res = await send(t, 'POST', '/api/admin/passport', {
      cookie,
      body: { workerId: WORKER_SKYLINE, kind: 'training', title: 'Fire Warden Course', hours: 12 },
    });
    expect(res.status).toBe(200);
    const entry = await json<PassportEntry>(res);
    expect(entry.workerId).toBe(WORKER_SKYLINE);
    expect(entry.industry).toBe('construction');
    expect(entry.hours).toBe(12);
  });

  it('refuses a worker from another site with 404', async () => {
    const t = await makeTestApp();
    const cookie = await login(t, ADMIN_SKYLINE);
    const res = await send(t, 'POST', '/api/admin/passport', {
      cookie,
      body: { workerId: WORKER_GREENFIELD, kind: 'training', title: 'First Aid' },
    });
    expect(res.status).toBe(404);
  });
});
