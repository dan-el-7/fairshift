import { Hono } from 'hono';
import { z } from 'zod';
import { computePayslip } from '../domain/payroll';
import { computePayCalendar } from '../domain/payCalendar';
import { istDay } from '../domain/time';
import type { Deps } from '../app';
import { requireRole, type AppEnv } from '../middleware/auth';
import { payPeriod } from '../services/calendar';
import { sessionContext } from '../services/people';
import { adjustedPayslip, effectiveWork } from '../services/corrections';
import { parseQuery } from './http';

const querySchema = z.object({
  period: z
    .string()
    .regex(/^(19|20)\d{2}-(0[1-9]|1[0-2])$/, 'YYYY-MM (1900–2099)')
    .optional(),
});

/** Worker payslip for a month (IST). Worker role only. */
export function payRoutes(deps: Deps): Hono<AppEnv> {
  const api = new Hono<AppEnv>();

  api.get('/pay/:view', requireRole('worker'), async (c) => {
    if (!['me', 'calendar'].includes(c.req.param('view'))) return c.json({ error: 'not found' }, 404);
    const query = parseQuery(c, querySchema);
    if (query instanceof Response) return query;
    const ctx = await sessionContext(c, deps.repo);
    if (!ctx) return c.json({ error: 'sign in required' }, 401);

    const today = istDay(deps.now());
    const currentMonth = today.slice(0, 7);
    const month = query.period ?? currentMonth;
    if (month > currentMonth) return c.json({ error: 'period is in the future' }, 400);

    const period = payPeriod(month, today);
    const { shifts, ledgers } = await effectiveWork(deps.repo, ctx.site.id, ctx.worker.id);
    const slip = adjustedPayslip(computePayslip(ctx.worker, shifts, period, ctx.cfg), ledgers);
    if (c.req.param('view') === 'calendar') {
      return c.json(computePayCalendar(ctx.worker, shifts, slip, ctx.cfg, today, await deps.repo.listDaysOff(ctx.site.id)));
    }
    return c.json(slip);
  });

  return api;
}
