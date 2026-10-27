import { Hono } from 'hono';
import { z } from 'zod';
import { computePayslip } from '../domain/payroll';
import { istDay } from '../domain/time';
import type { Deps } from '../app';
import { requireRole, type AppEnv } from '../middleware/auth';
import { payPeriod } from '../services/calendar';
import { sessionContext } from '../services/people';
import { parseQuery } from './http';

const querySchema = z.object({
  period: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'YYYY-MM')
    .optional(),
});

/** Worker payslip for a month (IST). Worker role only. */
export function payRoutes(deps: Deps): Hono<AppEnv> {
  const api = new Hono<AppEnv>();

  api.get('/pay/me', requireRole('worker'), async (c) => {
    const query = parseQuery(c, querySchema);
    if (query instanceof Response) return query;
    const ctx = await sessionContext(c, deps.repo);
    if (!ctx) return c.json({ error: 'sign in required' }, 401);

    const today = istDay(deps.now());
    const currentMonth = today.slice(0, 7);
    const month = query.period ?? currentMonth;
    if (month > currentMonth) return c.json({ error: 'period is in the future' }, 400);

    const period = payPeriod(month, today);
    const shifts = await deps.repo.listShifts({ workerId: ctx.worker.id, since: period.start });
    return c.json(computePayslip(ctx.worker, shifts, period, ctx.cfg));
  });

  return api;
}
