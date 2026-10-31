import { describe, expect, it } from 'vitest';
import type { CreateReportResponse, ReportPublic } from '../../../src/shared/api';
import type { Report } from '../../../src/shared/types';
import { createReportAi } from '../../../src/server/services/ai';
import { ADMIN_SKYLINE, WORKER_SKYLINE, json, login, makeTestApp, send, type TestApp } from './harness';

const CASE_CODE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/;

/** The stored report for a case code, read straight from the repo. */
async function storedReport(t: TestApp, siteId: string, caseCode: string): Promise<Report> {
  const found = (await t.repo.listReports(siteId)).find((r) => r.caseCode === caseCode);
  if (!found) throw new Error(`no stored report for ${caseCode}`);
  return found;
}

async function submit(t: TestApp, body: unknown, cookie?: string): Promise<Response> {
  return send(t, 'POST', '/api/reports', { body, cookie });
}

describe('POST /api/reports', () => {
  it('returns a case code, category and severity', async () => {
    const t = await makeTestApp();
    const res = await submit(t, { siteId: 'site-skyline', language: 'en', text: 'Loose cable near the lift.' });
    expect(res.status).toBe(200);
    const out = await json<CreateReportResponse>(res);
    expect(out.caseCode).toMatch(CASE_CODE);
    expect(out.category).toBe('electrical');
    expect(out.severity).toBe('high');
    expect(out.reporterToken).toMatch(/^[A-Za-z0-9_-]{40,}$/);
  });

  it('stores no worker id, IP or time of day, even when a session is present', async () => {
    const t = await makeTestApp();
    const cookie = await login(t, WORKER_SKYLINE);
    const res = await submit(t, { siteId: 'site-skyline', language: 'en', text: 'Scaffold plank is cracked.' }, cookie);
    const { caseCode, reporterToken } = await json<CreateReportResponse>(res);

    const stored = await storedReport(t, 'site-skyline', caseCode);
    expect(Object.keys(stored).sort()).toEqual(
      ['caseCode', 'category', 'createdDay', 'id', 'language', 'reporterSecretHash', 'severity', 'siteId', 'status', 'text', 'textEn', 'updates', 'version'].sort(),
    );
    expect(stored.reporterSecretHash).not.toBe(reporterToken);
    expect(JSON.stringify(stored)).not.toContain(WORKER_SKYLINE);
    expect(stored.createdDay).toBe('2026-10-27');
    expect(stored.status).toBe('open');
  });

  it('stores nothing that identifies an anonymous reporter', async () => {
    const t = await makeTestApp();
    const res = await submit(
      t,
      { siteId: 'site-skyline', language: 'en', text: 'Helmets missing.' },
    );
    const { caseCode } = await json<CreateReportResponse>(res);
    const stored = await storedReport(t, 'site-skyline', caseCode);
    const serialised = JSON.stringify(stored);
    expect(serialised).not.toMatch(/workerId|userId|ip|10:00|T\d\d:\d\d/i);
  });

  it('uses a valid body category and falls back to the AI category otherwise', async () => {
    const t = await makeTestApp();
    const valid = await json<CreateReportResponse>(
      await submit(t, { siteId: 'site-skyline', language: 'en', text: 'Fell from ladder.', category: 'fall_height' }),
    );
    expect(valid.category).toBe('fall_height');

    const invalid = await json<CreateReportResponse>(
      await submit(t, { siteId: 'site-greenfield', language: 'en', text: 'Fell from ladder.', category: 'fall_height' }),
    );
    expect(invalid.category).toBe('electrical');
  });

  it('redacts phone numbers and emails before storing', async () => {
    const t = await makeTestApp();
    const res = await submit(t, {
      siteId: 'site-skyline',
      language: 'en',
      text: 'Call 9876543210 or write to worker@example.com about the wiring.',
    });
    const { caseCode } = await json<CreateReportResponse>(res);
    const stored = await storedReport(t, 'site-skyline', caseCode);
    expect(stored.text).not.toContain('9876543210');
    expect(stored.text).not.toContain('worker@example.com');
    expect(stored.text).toContain('[redacted]');
  });

  it('returns 422 for audio when no AI service can transcribe it', async () => {
    const t = await makeTestApp({ ai: createReportAi({}) });
    const res = await submit(t, { siteId: 'site-skyline', language: 'ta', audioBase64: 'AAAA', audioMime: 'audio/webm' });
    expect(res.status).toBe(422);
  });

  it('accepts audio when the AI service is available', async () => {
    const t = await makeTestApp();
    const res = await submit(t, { siteId: 'site-skyline', language: 'ta', audioBase64: 'AAAA' });
    expect(res.status).toBe(200);
  });

  it('rejects a report without text or audio', async () => {
    const t = await makeTestApp();
    expect((await submit(t, { siteId: 'site-skyline', language: 'en' })).status).toBe(400);
  });

  it('returns 404 for an unknown site and 400 for an unknown language', async () => {
    const t = await makeTestApp();
    expect((await submit(t, { siteId: 'site-nowhere', language: 'en', text: 'x' })).status).toBe(404);
    expect((await submit(t, { siteId: 'site-skyline', language: 'fr', text: 'x' })).status).toBe(400);
  });
});

describe('private resolution confirmation', () => {
  it('keeps keys private and requires the case-specific capability even when signed in', async () => {
    const t = await makeTestApp();
    const response = await submit(t, { siteId: 'site-skyline', language: 'en', text: 'Unsafe wiring.' });
    expect(response.headers.get('cache-control')).toBe('no-store');
    const created = await json<CreateReportResponse>(response);
    const other = await json<CreateReportResponse>(await submit(t, { siteId: 'site-skyline', language: 'hi', text: 'Broken railing.' }));
    const stored = await storedReport(t, 'site-skyline', created.caseCode);
    expect(JSON.stringify(stored)).not.toContain(created.reporterToken);
    const admin = await login(t, ADMIN_SKYLINE);
    const adminList = await send(t, 'GET', '/api/admin/reports', { cookie: admin });
    const adminText = await adminList.text();
    expect(adminText).not.toContain('reporterSecretHash');
    expect(adminText).not.toContain(created.reporterToken);
    const publicText = await (await send(t, 'GET', `/api/reports/track/${created.caseCode}`)).text();
    expect(publicText).not.toContain('reporterSecretHash');
    expect(publicText).not.toContain(created.reporterToken);
    await send(t, 'PATCH', `/api/admin/reports/${stored.id}`, { cookie: admin, body: { status: 'resolved', expectedVersion: stored.version } });
    const worker = await login(t, WORKER_SKYLINE);
    for (const reporterToken of ['x'.repeat(43), other.reporterToken]) {
      expect((await send(t, 'POST', `/api/reports/track/${created.caseCode}/respond`, { cookie: worker, body: { reporterToken, decision: 'confirmed', expectedVersion: 2 } })).status).toBe(403);
    }
    const attempts = await Promise.all(['confirmed', 'disputed'].map((decision) => send(t, 'POST', `/api/reports/track/${created.caseCode}/respond`, { body: { reporterToken: created.reporterToken, decision, expectedVersion: 2 } })));
    expect(attempts.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await storedReport(t, 'site-skyline', created.caseCode)).updates.filter((u) => u.actor === 'reporter')).toHaveLength(1);
  });

  it('requires a resolved case and supports dispute, re-resolution, and confirmation', async () => {
    const t = await makeTestApp();
    const created = await json<CreateReportResponse>(await submit(t, { siteId: 'site-skyline', language: 'en', text: 'Exposed wiring.' }));
    const admin = await login(t, ADMIN_SKYLINE);
    const reports = await json<{ id: string; caseCode: string; status: string; version?: number }[]>(await send(t, 'GET', '/api/admin/reports', { cookie: admin }));
    const current = reports.find((item) => item.caseCode === created.caseCode);
    if (!current) throw new Error('created report not listed');
    const reply = (decision: 'confirmed' | 'disputed', expectedVersion: number) => send(t, 'POST', `/api/reports/track/${created.caseCode}/respond`, { body: { reporterToken: created.reporterToken, decision, expectedVersion } });
    expect((await reply('confirmed', current.version ?? 0)).status).toBe(409);
    const resolved = await send(t, 'PATCH', `/api/admin/reports/${current.id}`, { cookie: admin, body: { status: 'resolved', expectedVersion: current.version ?? 0 } });
    const resolvedBody = await json<{ version: number }>(resolved);
    const disputed = await json<{ status: string; version: number }>(await reply('disputed', resolvedBody.version));
    expect(disputed.status).toBe('open');
    const resolvedAgain = await send(t, 'PATCH', `/api/admin/reports/${current.id}`, { cookie: admin, body: { status: 'resolved', expectedVersion: disputed.version } });
    const resolvedAgainBody = await json<{ version: number }>(resolvedAgain);
    const confirmed = await json<{ status: string; version: number }>(await reply('confirmed', resolvedAgainBody.version));
    expect(confirmed.status).toBe('resolved');
    expect((await reply('confirmed', confirmed.version)).status).toBe(409);
    const unchangedResolved = await send(t, 'PATCH', `/api/admin/reports/${current.id}`, { cookie: admin, body: { status: 'resolved', note: 'Checked again', expectedVersion: confirmed.version } });
    const unchanged = await json<{ version: number; fixResponse?: string }>(unchangedResolved);
    expect(unchanged.fixResponse).toBe('confirmed');
    expect((await reply('disputed', unchanged.version)).status).toBe(409);
  });
});

describe('GET /api/reports/track/:caseCode', () => {
  it('returns the public view of a report by case code', async () => {
    const t = await makeTestApp();
    const { caseCode } = await json<CreateReportResponse>(
      await submit(t, { siteId: 'site-skyline', language: 'en', text: 'No drinking water.' }),
    );
    const res = await send(t, 'GET', `/api/reports/track/${caseCode}`);
    expect(res.status).toBe(200);
    const view = await json<ReportPublic & { siteId?: string }>(res);
    expect(view.caseCode).toBe(caseCode);
    expect(view.status).toBe('open');
    expect(view.createdDay).toBe('2026-10-27');
    expect(view).not.toHaveProperty('siteId');
  });

  it('returns 404 for an unknown case code', async () => {
    const t = await makeTestApp();
    expect((await send(t, 'GET', '/api/reports/track/ZZZZ-ZZZZ')).status).toBe(404);
    expect((await send(t, 'GET', '/api/reports/track/not-a-code')).status).toBe(404);
  });

  it('shows admin updates on the public track view', async () => {
    const t = await makeTestApp();
    const cookie = await login(t, ADMIN_SKYLINE);
    const reports = await json<{ id: string; caseCode: string }[]>(await send(t, 'GET', '/api/admin/reports', { cookie }));
    const target = reports[0];
    if (!target) throw new Error('seed has no reports');
    await send(t, 'PATCH', `/api/admin/reports/${target.id}`, {
      cookie,
      body: { status: 'acknowledged', note: 'Looking into it' },
    });
    const view = await json<ReportPublic>(await send(t, 'GET', `/api/reports/track/${target.caseCode}`));
    expect(view.status).toBe('acknowledged');
    expect(view.updates.at(-1)?.note).toBe('Looking into it');
  });
});
