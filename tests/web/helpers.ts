import { vi } from 'vitest';
import type { AttendanceMe, Me, Persona } from '../../src/shared/api';
import type { Payslip } from '../../src/shared/types';

export const worker: Me = {
  id: 'worker-ravi',
  name: 'Ravi Kumar',
  role: 'worker',
  language: 'en',
  jobTitle: 'Mason',
  site: {
    id: 'site-skyline',
    name: 'Skyline Towers, Chennai',
    industry: 'construction',
    lat: 13.0827,
    lng: 80.2707,
    radiusM: 300,
  },
};

export const personas: Persona[] = [
  { id: 'worker-ravi', name: 'Ravi Kumar', role: 'worker', industry: 'construction', siteName: 'Skyline Towers, Chennai', language: 'en' },
  { id: 'admin-skyline', name: 'Meera Admin', role: 'admin', industry: 'construction', siteName: 'Skyline Towers, Chennai', language: 'en' },
];

export const emptyAttendance: AttendanceMe = { open: null, recent: [], fatigue: [] };

/** A daily-wage payslip: 22 days at 750 rupees, EPF capped at 1,800, ESI 0.75% of gross. */
export const payslip: Payslip = {
  workerId: 'worker-ravi',
  period: { id: '2026-10', start: '2026-09-30T18:30:00.000Z', end: '2026-10-31T18:30:00.000Z', workingDays: 26 },
  industry: 'construction',
  lines: [
    { key: 'pay.base', amount: 1650000, kind: 'earning', params: { days: 22, rate: 75000 } },
    { key: 'pay.pf', amount: 180000, kind: 'deduction', params: {} },
    { key: 'pay.esi', amount: 12375, kind: 'deduction', params: {} },
  ],
  gross: 1650000,
  deductions: 192375,
  net: 1457625,
  summary: { hours: 176, regularHours: 176, overtimeHours: 0, nightHours: 0, daysWorked: 22 },
};

export interface Reply {
  status: number;
  body: unknown;
}

/** A route answer: a plain value (sent with 200), or a function returning reply(...). */
type Responder = unknown;

/** Answer a mock route with a non-200 status. */
export function reply(status: number, body: unknown): () => Reply {
  return () => ({ status, body });
}

function isReplyFn(value: unknown): value is () => Reply {
  return typeof value === 'function';
}

/**
 * Replaces global fetch. Keys are URL path prefixes; query strings are ignored for matching,
 * so '/api/pay/me' matches '/api/pay/me?period=2026-10'. Unknown URLs get a 404.
 */
export function mockFetch(routes: Record<string, Responder>) {
  const fn = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0] ?? '';
    const key = Object.keys(routes).find((prefix) => path === prefix || path.startsWith(`${prefix}/`));
    if (key === undefined) return json(404, { error: 'not found' });
    const responder = routes[key];
    const answer: Reply = isReplyFn(responder) ? responder() : { status: 200, body: responder };
    return json(answer.status, answer.body);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
