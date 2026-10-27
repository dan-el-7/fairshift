import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import type { FeedbackResponse } from '../../shared/types';
import type { Deps } from '../app';
import { feedbackDedupeKey, redactPII } from '../domain/anonymity';
import { istDay } from '../domain/time';
import { requireRole, type AppEnv } from '../middleware/auth';
import { sessionContext } from '../services/people';
import { parseBody } from './http';

const rating = z.number().int().min(1).max(5);

const feedbackSchema = z.object({
  ratings: z.object({
    safety: rating,
    fairness: rating,
    respect: rating,
    workload: rating,
  }),
  comment: z.string().trim().max(500).optional(),
});

/** Anonymous monthly feedback from workers. */
export function feedbackRoutes(deps: Deps): Hono<AppEnv> {
  const api = new Hono<AppEnv>();

  api.post('/feedback', requireRole('worker'), async (c) => {
    const body = await parseBody(c, feedbackSchema);
    if (body instanceof Response) return body;
    const ctx = await sessionContext(c, deps.repo);
    if (!ctx) return c.json({ error: 'sign in required' }, 401);

    const month = istDay(deps.now()).slice(0, 7);
    const key = feedbackDedupeKey(ctx.worker.id, ctx.site.id, month, deps.config.sessionSecret);
    if (!(await deps.repo.claimDedupeKey(key))) {
      return c.json({ error: 'feedback already submitted this month' }, 409);
    }

    const response: FeedbackResponse = {
      id: randomUUID(),
      siteId: ctx.site.id,
      month,
      ratings: body.ratings,
    };
    if (body.comment !== undefined && body.comment.length > 0) response.comment = redactPII(body.comment);
    try {
      await deps.repo.saveFeedback(response);
    } catch (err) {
      // The save failed, so the worker has not submitted: free the month's key so a retry can succeed.
      await deps.repo.releaseDedupeKey(key);
      throw err;
    }
    return c.json({ ok: true });
  });

  return api;
}
