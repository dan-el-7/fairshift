import { describe, expect, it } from 'vitest';
import type { AdminFeedback } from '../../../src/shared/api';
import type { FeedbackAggregate } from '../../../src/shared/types';
import { ADMIN_SKYLINE, WORKER_SKYLINE, json, login, makeTestApp, send } from './harness';

const ratings = { safety: 4, fairness: 3, respect: 5, workload: 2 };

describe('POST /api/feedback', () => {
  it('accepts one response per worker per month', async () => {
    const t = await makeTestApp();
    const cookie = await login(t, WORKER_SKYLINE);
    const first = await send(t, 'POST', '/api/feedback', { cookie, body: { ratings, comment: 'Shade is needed.' } });
    expect(first.status).toBe(200);
    expect(await json<{ ok: boolean }>(first)).toEqual({ ok: true });

    const second = await send(t, 'POST', '/api/feedback', { cookie, body: { ratings } });
    expect(second.status).toBe(409);
  });

  it('lets the worker retry when the save fails, and stores exactly one response', async () => {
    const t = await makeTestApp();
    const cookie = await login(t, WORKER_SKYLINE);
    const realSave = t.repo.saveFeedback.bind(t.repo);
    let failedOnce = false;
    t.repo.saveFeedback = async (response) => {
      if (!failedOnce) {
        failedOnce = true;
        throw new Error('store unavailable');
      }
      await realSave(response);
    };
    const before = (await t.repo.listFeedback('site-skyline')).length;

    const first = await send(t, 'POST', '/api/feedback', { cookie, body: { ratings } });
    expect(first.status).toBe(500);
    const retry = await send(t, 'POST', '/api/feedback', { cookie, body: { ratings } });
    expect(retry.status).toBe(200);
    expect(await t.repo.listFeedback('site-skyline')).toHaveLength(before + 1);
  });

  it('stores the response without any worker id', async () => {
    const t = await makeTestApp();
    const before = (await t.repo.listFeedback('site-skyline')).length;
    const cookie = await login(t, WORKER_SKYLINE);
    await send(t, 'POST', '/api/feedback', { cookie, body: { ratings } });

    const stored = await t.repo.listFeedback('site-skyline');
    expect(stored).toHaveLength(before + 1);
    expect(JSON.stringify(stored)).not.toContain(WORKER_SKYLINE);
  });

  it('rejects ratings outside 1 to 5', async () => {
    const t = await makeTestApp();
    const cookie = await login(t, WORKER_SKYLINE);
    const res = await send(t, 'POST', '/api/feedback', {
      cookie,
      body: { ratings: { ...ratings, safety: 9 } },
    });
    expect(res.status).toBe(400);
  });

  it('returns 401 for anonymous submissions', async () => {
    const t = await makeTestApp();
    expect((await send(t, 'POST', '/api/feedback', { body: { ratings } })).status).toBe(401);
  });
});

describe('GET /api/admin/feedback', () => {
  it('returns averages once the group is at least five responses', async () => {
    const t = await makeTestApp();
    const cookie = await login(t, ADMIN_SKYLINE);
    const body = await json<AdminFeedback>(await send(t, 'GET', '/api/admin/feedback', { cookie }));
    expect(body).not.toHaveProperty('insufficient');
    const aggregate = body as FeedbackAggregate;
    expect(aggregate.count).toBe(7);
    expect(aggregate.averages.safety).toBeGreaterThanOrEqual(1);
    expect(aggregate.averages.safety).toBeLessThanOrEqual(5);
  });

  it('hides results below five responses', async () => {
    const t = await makeTestApp({ feedbackPerSite: 2 });
    const cookie = await login(t, ADMIN_SKYLINE);
    const body = await json<AdminFeedback>(await send(t, 'GET', '/api/admin/feedback', { cookie }));
    expect(body).toEqual({ insufficient: true, count: 2 });
  });

  it('is not available to workers', async () => {
    const t = await makeTestApp();
    const cookie = await login(t, WORKER_SKYLINE);
    expect((await send(t, 'GET', '/api/admin/feedback', { cookie })).status).toBe(403);
  });
});
