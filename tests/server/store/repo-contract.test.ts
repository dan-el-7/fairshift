import { describe, expect, it } from 'vitest';
import type { FeedbackResponse, PassportEntry, Report, Shift, Site, Worker } from '../../../src/shared/types';
import { createFirestoreRepo } from '../../../src/server/store/firestore';
import { createMemoryRepo } from '../../../src/server/store/memory';
import type { Repo } from '../../../src/server/store/repo';
import { bufferWrites, createRedisRepo, hashToRecord, type WriteOp } from '../../../src/server/store/redis';
import { seedDemo } from '../../../src/server/store/seed';
import { createFakeFirestore } from './fake-firestore';
import { createFakeKv } from './fake-kv';

const SITE_A: Site = { id: 'site-a', name: 'Site A', industry: 'construction', lat: 13, lng: 80, radiusM: 300 };
const SITE_B: Site = { id: 'site-b', name: 'Site B', industry: 'college', lat: 12, lng: 80, radiusM: 500 };

const RAVI: Worker = { id: 'worker-ravi', name: 'Ravi', siteId: 'site-a', role: 'worker', language: 'en', jobTitle: 'Mason', joinedOn: '2024-03-01' };
const MEENA: Worker = { id: 'worker-meena', name: 'Meena', siteId: 'site-a', role: 'worker', language: 'ta', jobTitle: 'Helper', joinedOn: '2024-05-01', advanceThisPeriod: 500 };
const LAKSHMI: Worker = { id: 'worker-lakshmi', name: 'Lakshmi', siteId: 'site-b', role: 'admin', language: 'en', jobTitle: 'Lab', joinedOn: '2023-07-10' };

const SHIFT_DONE: Shift = { id: 'shift-1', workerId: RAVI.id, siteId: 'site-a', checkIn: '2026-10-26T03:00:00.000Z', checkOut: '2026-10-26T11:00:00.000Z', method: 'qr' };
const SHIFT_OPEN: Shift = { id: 'shift-2', workerId: RAVI.id, siteId: 'site-a', checkIn: '2026-10-27T03:00:00.000Z', checkOut: null, method: 'geo' };
const SHIFT_MEENA: Shift = { id: 'shift-3', workerId: MEENA.id, siteId: 'site-a', checkIn: '2026-10-20T03:00:00.000Z', checkOut: '2026-10-20T11:00:00.000Z', method: 'qr' };

const REPORT_1: Report = {
  id: 'rpt-1', caseCode: 'ABCD-2345', siteId: 'site-a', category: 'electrical', severity: 'high', language: 'en',
  text: 'Sparks from a socket.', textEn: 'Sparks from a socket.', status: 'open', createdDay: '2026-10-27', updates: [],
};
const REPORT_2: Report = {
  id: 'rpt-2', caseCode: 'WXYZ-6789', siteId: 'site-a', category: 'wage_issue', severity: 'medium', language: 'ta',
  text: 'Wages late', textEn: 'Wages late', status: 'acknowledged', createdDay: '2026-10-25',
  updates: [{ status: 'acknowledged', note: 'Looking into it', day: '2026-10-26' }],
};
const REPORT_B: Report = {
  id: 'rpt-3', caseCode: 'QRST-2222', siteId: 'site-b', category: 'other', severity: 'low', language: 'en',
  text: 'Add a cooler.', textEn: 'Add a cooler.', status: 'open', createdDay: '2026-10-27', updates: [],
};

const FB_1: FeedbackResponse = { id: 'fb-1', siteId: 'site-a', month: '2026-10', ratings: { safety: 4, fairness: 3, respect: 5, workload: 2 }, comment: 'Good' };
const FB_2: FeedbackResponse = { id: 'fb-2', siteId: 'site-a', month: '2026-09', ratings: { safety: 2, fairness: 2, respect: 2, workload: 2 } };
const FB_B: FeedbackResponse = { id: 'fb-3', siteId: 'site-b', month: '2026-10', ratings: { safety: 5, fairness: 5, respect: 5, workload: 5 } };

const PP_TRAINING: PassportEntry = { id: 'pp-1', workerId: RAVI.id, kind: 'training', title: 'First Aid', issuer: 'Council', issuedOn: '2025-01-10', hours: 8, industry: 'construction' };
const PP_EXPERIENCE: PassportEntry = { id: 'pp-2', workerId: RAVI.id, kind: 'experience', title: 'Mason', issuer: 'Employer', issuedOn: '2024-03-01', industry: 'construction' };

interface Backend {
  name: string;
  make: () => Repo;
}

const backends: Backend[] = [
  { name: 'memory', make: () => createMemoryRepo() },
  { name: 'redis (fake client)', make: () => createRedisRepo(createFakeKv()) },
  { name: 'firestore (fake client)', make: () => createFirestoreRepo(createFakeFirestore()) },
];

describe.each(backends)('repo contract: $name', ({ make }) => {
  async function seeded(): Promise<Repo> {
    const repo = make();
    for (const site of [SITE_A, SITE_B]) await repo.saveSite(site);
    for (const worker of [RAVI, MEENA, LAKSHMI]) await repo.saveWorker(worker);
    for (const shift of [SHIFT_DONE, SHIFT_OPEN, SHIFT_MEENA]) await repo.saveShift(shift);
    for (const report of [REPORT_1, REPORT_2, REPORT_B]) await repo.saveReport(report);
    for (const response of [FB_1, FB_2, FB_B]) await repo.saveFeedback(response);
    for (const entry of [PP_TRAINING, PP_EXPERIENCE]) await repo.savePassport(entry);
    return repo;
  }

  it('saves, gets and lists sites', async () => {
    const repo = await seeded();
    expect(await repo.getSite('site-a')).toEqual(SITE_A);
    expect(await repo.getSite('missing')).toBeNull();
    expect((await repo.listSites()).map((s) => s.id)).toEqual(['site-a', 'site-b']);
  });

  it('saves, gets and lists workers by site', async () => {
    const repo = await seeded();
    expect(await repo.getWorker(RAVI.id)).toEqual(RAVI);
    expect(await repo.getWorker('nobody')).toBeNull();
    expect((await repo.listWorkers('site-a')).map((w) => w.id)).toEqual([MEENA.id, RAVI.id]);
    expect((await repo.listWorkers('site-b')).map((w) => w.id)).toEqual([LAKSHMI.id]);
  });

  it('updates a saved worker in place', async () => {
    const repo = await seeded();
    await repo.saveWorker({ ...RAVI, jobTitle: 'Foreman' });
    expect((await repo.getWorker(RAVI.id))?.jobTitle).toBe('Foreman');
    expect(await repo.listWorkers('site-a')).toHaveLength(2);
  });

  it('lists shifts by worker, site and since, sorted by check-in', async () => {
    const repo = await seeded();
    expect((await repo.listShifts({ workerId: RAVI.id })).map((s) => s.id)).toEqual([SHIFT_DONE.id, SHIFT_OPEN.id]);
    expect((await repo.listShifts({ siteId: 'site-a' })).map((s) => s.id)).toEqual([
      SHIFT_MEENA.id,
      SHIFT_DONE.id,
      SHIFT_OPEN.id,
    ]);
    expect(await repo.listShifts({ siteId: 'site-b' })).toEqual([]);
    const since = await repo.listShifts({ workerId: RAVI.id, since: '2026-10-26T12:00:00.000Z' });
    expect(since.map((s) => s.id)).toEqual([SHIFT_OPEN.id]);
  });

  it('finds the open shift of a worker, and none once checked out', async () => {
    const repo = await seeded();
    expect((await repo.getOpenShift(RAVI.id))?.id).toBe(SHIFT_OPEN.id);
    expect(await repo.getOpenShift(MEENA.id)).toBeNull();
    await repo.saveShift({ ...SHIFT_OPEN, checkOut: '2026-10-27T10:00:00.000Z' });
    expect(await repo.getOpenShift(RAVI.id)).toBeNull();
  });

  it('saves, gets and lists reports by site, and finds them by case code', async () => {
    const repo = await seeded();
    expect(await repo.getReport('rpt-1')).toEqual(REPORT_1);
    expect(await repo.getReport('missing')).toBeNull();
    expect(await repo.getReportByCode('WXYZ-6789')).toEqual(REPORT_2);
    expect(await repo.getReportByCode('NOPE-0000')).toBeNull();
    expect((await repo.listReports('site-a')).map((r) => r.id)).toEqual(['rpt-1', 'rpt-2']);
    expect((await repo.listReports('site-b')).map((r) => r.id)).toEqual(['rpt-3']);
  });

  it('replaces a report on save and keeps its updates', async () => {
    const repo = await seeded();
    await repo.saveReport({ ...REPORT_1, status: 'resolved', updates: [{ status: 'resolved', day: '2026-10-27' }] });
    const saved = await repo.getReport('rpt-1');
    expect(saved?.status).toBe('resolved');
    expect(saved?.updates).toHaveLength(1);
  });

  it('lists feedback by site and records dedupe keys once', async () => {
    const repo = await seeded();
    expect((await repo.listFeedback('site-a')).map((f) => f.id).sort()).toEqual(['fb-1', 'fb-2']);
    expect(await repo.listFeedback('site-b')).toEqual([FB_B]);
    expect(await repo.claimDedupeKey('key-1')).toBe(true);
    expect(await repo.claimDedupeKey('key-1')).toBe(false);
    expect(await repo.claimDedupeKey('key-2')).toBe(true);
  });

  it('lists passport entries per worker', async () => {
    const repo = await seeded();
    expect((await repo.listPassport(RAVI.id)).map((e) => e.id)).toEqual(['pp-1', 'pp-2']);
    expect(await repo.listPassport(MEENA.id)).toEqual([]);
  });

  it('returns copies, so mutating a result never changes stored state', async () => {
    const repo = await seeded();
    const site = await repo.getSite('site-a');
    if (site) site.name = 'Changed';
    expect((await repo.getSite('site-a'))?.name).toBe('Site A');
  });
});

describe('redis store specifics', () => {
  it('reads Upstash raw HGETALL arrays as field/value records', () => {
    expect(hashToRecord(['a', '{"x":1}', 'b', '2'])).toEqual({ a: '{"x":1}', b: '2' });
    expect(hashToRecord({ a: '1' })).toEqual({ a: '1' });
    expect(hashToRecord(null)).toEqual({});
    expect(hashToRecord([])).toEqual({});
  });

  it('records the seeded day only when marked', async () => {
    const repo = createRedisRepo(createFakeKv());
    expect(await repo.seededDay()).toBeNull();
    await repo.markSeeded('2026-10-27');
    expect(await repo.seededDay()).toBe('2026-10-27');
  });

  it('clears every FairShift key so a new day starts from a clean seed', async () => {
    const kv = createFakeKv();
    const repo = createRedisRepo(kv);
    await seedDemo(repo, new Date('2026-10-27T10:00:00Z'));
    await repo.markSeeded('2026-10-27');
    await repo.clear();
    expect(kv.dump()).toHaveLength(0);
    expect(await repo.seededDay()).toBeNull();
  });

  it('seeds the full demo through a write buffer in one batch', async () => {
    const kv = createFakeKv();
    let batches = 0;
    let batched = 0;
    const counting = {
      ...kv,
      async writeMany(ops: WriteOp[]) {
        batches += 1;
        batched += ops.length;
        for (const op of ops) {
          if (op[0] === 'set') await kv.set(op[1], op[2]);
          else if (op[0] === 'hset') await kv.hset(op[1], op[2], op[3]);
          else await kv.sadd(op[1], op[2]);
        }
      },
    };
    const buffered = bufferWrites(counting);
    await seedDemo(createRedisRepo(buffered), new Date('2026-10-27T10:00:00Z'));
    expect(await createRedisRepo(kv).listSites()).toHaveLength(0);

    await buffered.flush();
    expect(batches).toBe(1);
    expect(batched).toBeGreaterThan(100);
    const repo = createRedisRepo(kv);
    expect(await repo.listSites()).toHaveLength(2);
    expect((await repo.listWorkers('site-skyline')).length).toBeGreaterThan(0);
  });

  it('stores reports and feedback without any worker id', async () => {
    const kv = createFakeKv();
    const repo = createRedisRepo(kv);
    await repo.saveWorker(RAVI);
    await repo.saveShift(SHIFT_OPEN);
    await repo.saveReport(REPORT_1);
    await repo.saveFeedback(FB_1);
    await repo.claimDedupeKey('a-key');

    const anonymousRows = kv.dump().filter(([key]) => /^fs:(report|feedback)/.test(key));
    expect(anonymousRows.length).toBeGreaterThan(0);
    for (const [key, value] of anonymousRows) {
      expect(key + value).not.toContain(RAVI.id);
    }
    expect(kv.dump().map(([, value]) => value).join('\n')).toContain(REPORT_1.text);
  });

  it('uses the fs: key prefix for everything it writes', async () => {
    const kv = createFakeKv();
    const repo = createRedisRepo(kv);
    await repo.saveSite(SITE_A);
    await repo.saveReport(REPORT_1);
    for (const [key] of kv.dump()) expect(key.startsWith('fs:')).toBe(true);
  });
});
