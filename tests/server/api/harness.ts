import type { Hono } from 'hono';
import { sign } from 'hono/jwt';
import { createApp } from '../../../src/server/app';
import type { AppConfig } from '../../../src/server/config';
import type { AppEnv } from '../../../src/server/middleware/auth';
import { generatePassportKeys } from '../../../src/server/domain/passport';
import type { ReportAI } from '../../../src/server/services/ai';
import { createMemoryRepo } from '../../../src/server/store/memory';
import type { Repo } from '../../../src/server/store/repo';
import { seedDemo } from '../../../src/server/store/seed';

/** Tuesday 27 Oct 2026, 15:30 IST. */
export const NOW = new Date('2026-10-27T10:00:00Z');
export const SESSION_SECRET = 'test-session-secret-with-enough-entropy-0123456789';

export const WORKER_SKYLINE = 'worker-skyline-1';
export const FATIGUE_WORKER = 'worker-skyline-2';
export const ADMIN_SKYLINE = 'admin-skyline';
export const WORKER_GREENFIELD = 'worker-greenfield-1';
export const ADMIN_GREENFIELD = 'admin-greenfield';

/** Deterministic AI double: echoes the text and returns a fixed category and severity. */
export const fakeAi: ReportAI = {
  async analyse({ text }) {
    const body = text && text.length > 0 ? text : 'Transcribed audio report';
    return { text: body, textEn: body, category: 'electrical', severity: 'high' };
  },
};

/** An app with its own memory repo, seeded demo data and a clock the test can move. */
export interface TestApp {
  app: Hono<AppEnv>;
  repo: Repo;
  config: AppConfig;
  clock: { now: Date };
}

export interface TestAppOptions {
  ai?: ReportAI;
  feedbackPerSite?: number;
  secureCookies?: boolean;
}

/** Builds a seeded app for one test. Each call gets fresh state, so rate-limit counters never leak. */
export async function makeTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  const repo = createMemoryRepo();
  await seedDemo(repo, NOW, { feedbackPerSite: options.feedbackPerSite ?? 7 });
  const keys = generatePassportKeys();
  const config: AppConfig = {
    sessionSecret: SESSION_SECRET,
    secureCookies: options.secureCookies ?? false,
    passport: { privateKey: keys.privateKey, publicKey: keys.publicKey, publicPem: keys.publicPem },
  };
  const clock = { now: new Date(NOW.getTime()) };
  const app = createApp({ repo, ai: options.ai ?? fakeAi, config, now: () => new Date(clock.now.getTime()) });
  return { app, repo, config, clock };
}

export interface RequestOptions {
  body?: unknown;
  cookie?: string;
}

/** Sends a request to the app in-process. */
export async function send(t: TestApp, method: string, path: string, options: RequestOptions = {}): Promise<Response> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.cookie) headers.cookie = options.cookie;
  return t.app.request(path, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

/** Logs in through the demo endpoint and returns the `fs_session=...` cookie pair. */
export async function login(t: TestApp, personaId: string): Promise<string> {
  const res = await send(t, 'POST', '/api/auth/demo', { body: { personaId } });
  const setCookie = res.headers.get('set-cookie') ?? '';
  return setCookie.split(';')[0] ?? '';
}

/**
 * Signs a session cookie for any seeded person, including those who are not demo personas.
 * Uses the same secret and claims as the real login path.
 */
export async function sessionCookieFor(id: string, role: 'worker' | 'admin', siteId: string): Promise<string> {
  const exp = Math.floor(NOW.getTime() / 1000) + 12 * 60 * 60;
  const token = await sign({ sub: id, role, siteId, exp }, SESSION_SECRET, 'HS256');
  return `fs_session=${token}`;
}

/** Parses a JSON response body with the expected shape. */
export async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}
