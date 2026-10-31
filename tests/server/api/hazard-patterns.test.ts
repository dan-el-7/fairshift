import { describe, expect, it } from 'vitest';
import type { HazardPatternsResponse } from '../../../src/shared/hazardPatterns';
import type { Report } from '../../../src/shared/types';
import { ADMIN_SKYLINE, ADMIN_GREENFIELD, WORKER_SKYLINE, json, login, makeTestApp, send } from './harness';

function report(id: string, siteId: string, day: string): Report {
  return {
    id, caseCode: `CASE-${id}`, siteId, category: 'electrical', severity: 'high', language: 'en',
    text: 'private report text', textEn: 'private report text', status: 'open', createdDay: day, updates: [],
  };
}

describe('GET /api/admin/hazard-patterns', () => {
  it('requires admin auth and returns only thresholded aggregate fields for the signed-in site', async () => {
    const t = await makeTestApp();
    for (const [id, day] of [['one', '2026-10-25'], ['two', '2026-10-26'], ['three', '2026-10-27']] as const) {
      await t.repo.saveReport(report(id, 'site-skyline', day));
    }
    for (const [id, day] of [['other-one', '2026-10-25'], ['other-two', '2026-10-26'], ['other-three', '2026-10-27']] as const) {
      await t.repo.saveReport(report(id, 'site-greenfield', day));
    }
    expect((await send(t, 'GET', '/api/admin/hazard-patterns')).status).toBe(401);
    const admin = await login(t, ADMIN_SKYLINE);
    const response = await send(t, 'GET', '/api/admin/hazard-patterns', { cookie: admin });
    expect(response.status).toBe(200);
    const body = await json<HazardPatternsResponse>(response);
    expect(body).toMatchObject({ windowDays: 30, patterns: [{ category: 'electrical', reportCount: 3, unresolvedCount: 3 }] });
    expect(JSON.stringify(body)).not.toContain('private report text');
    const worker = await login(t, WORKER_SKYLINE);
    expect((await send(t, 'GET', '/api/admin/hazard-patterns', { cookie: worker })).status).toBe(403);
    const greenfield = await login(t, ADMIN_GREENFIELD);
    const greenfieldBody = await json<HazardPatternsResponse>(await send(t, 'GET', '/api/admin/hazard-patterns', { cookie: greenfield }));
    expect(greenfieldBody.patterns[0]?.reportCount).toBe(4);
  });
});
