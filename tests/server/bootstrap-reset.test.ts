import { describe, expect, it } from 'vitest';
import { openRepo } from '../../src/server/bootstrap';
import { loadConfig, type ServerConfig } from '../../src/server/config';
import type { Report } from '../../src/shared/types';
import { createRedisRepo } from '../../src/server/store/redis';
import { createFakeKv } from './store/fake-kv';

const NOW = new Date('2026-10-27T10:00:00Z'); // 27 Oct 2026 in IST
const YESTERDAY = '2026-10-26';
const TODAY = '2026-10-27';

/** A report a reporter submitted: it must survive unless the daily reset wipes all data. */
const USER_REPORT: Report = {
  id: 'rpt-user', caseCode: 'USER-1234', siteId: 'site-skyline', category: 'other', severity: 'low', language: 'en',
  text: 'Submitted by a worker', textEn: 'Submitted by a worker', status: 'open', createdDay: TODAY, updates: [],
};

function configFor(demoDailyReset: boolean): ServerConfig {
  const base = loadConfig({ SESSION_SECRET: 'bootstrap-test-secret-with-enough-entropy-0123456789', STORE: 'redis', KV_REST_API_URL: 'https://kv.test', KV_REST_API_TOKEN: 'token' });
  return { ...base, demoDailyReset };
}

/** A Redis store whose demo was seeded on `seededOn`, with one user-submitted report. */
async function storeSeededOn(seededOn: string) {
  const kv = createFakeKv();
  const repo = createRedisRepo(kv);
  await repo.markSeeded(seededOn);
  await repo.saveReport(USER_REPORT);
  return { kv, repo };
}

describe('demo reset off (default): seed once, never clear', () => {
  it('seeds a store that has never been seeded', async () => {
    const kv = createFakeKv();
    const repo = await openRepo(configFor(false), kv, NOW);
    expect(await repo.listSites()).toHaveLength(2);
    expect(await repo.getWorker('worker-skyline-1')).not.toBeNull();
    expect(await createRedisRepo(kv).seededDay()).toBe(TODAY);
  });

  it('keeps submitted reports and the old seed day when the demo is from an earlier day', async () => {
    const { kv } = await storeSeededOn(YESTERDAY);
    const repo = await openRepo(configFor(false), kv, NOW);
    expect(await repo.getReportByCode('USER-1234')).not.toBeNull();
    expect(await createRedisRepo(kv).seededDay()).toBe(YESTERDAY);
    expect(await repo.listSites()).toHaveLength(0);
  });
});

describe('demo reset on (DEMO_DAILY_RESET=true): clear and reseed once per IST day', () => {
  it('wipes submitted reports and reseeds when the demo is from an earlier day', async () => {
    const { kv } = await storeSeededOn(YESTERDAY);
    const repo = await openRepo(configFor(true), kv, NOW);
    expect(await repo.getReportByCode('USER-1234')).toBeNull();
    expect(await createRedisRepo(kv).seededDay()).toBe(TODAY);
    expect(await repo.listSites()).toHaveLength(2);
  });

  it('leaves the demo from today, and what users submitted in it, untouched', async () => {
    const { kv } = await storeSeededOn(TODAY);
    const repo = await openRepo(configFor(true), kv, NOW);
    expect(await repo.getReportByCode('USER-1234')).not.toBeNull();
    expect(await repo.listSites()).toHaveLength(0);
  });
});
