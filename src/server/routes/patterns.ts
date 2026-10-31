import { Hono } from 'hono';
import type { Deps } from '../app';
import { summarizeHazardPatterns } from '../domain/hazardPatterns';
import { requireRole, type AppEnv } from '../middleware/auth';
import { sessionContext } from '../services/people';

/** Site scoped, thresholded aggregate summaries for admin users. */
export function patternRoutes({ repo, now }: Deps): Hono<AppEnv> {
  const api = new Hono<AppEnv>();
  api.use('/admin/hazard-patterns', requireRole('admin'));
  api.get('/admin/hazard-patterns', async (c) => {
    const ctx = await sessionContext(c, repo);
    if (!ctx) return c.json({ error: 'sign in required' }, 401);
    const reports = await repo.listReports(ctx.site.id);
    return c.json(summarizeHazardPatterns(reports, now()));
  });
  return api;
}
