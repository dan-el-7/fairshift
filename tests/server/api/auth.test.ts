import { describe, expect, it } from 'vitest';
import type { Me, Persona } from '../../../src/shared/api';
import { ADMIN_SKYLINE, WORKER_SKYLINE, json, login, makeTestApp, send } from './harness';

describe('health and personas', () => {
  it('reports healthy', async () => {
    const t = await makeTestApp();
    const res = await send(t, 'GET', '/api/health');
    expect(res.status).toBe(200);
    expect(await json<{ ok: boolean }>(res)).toEqual({ ok: true });
  });

  it('lists one worker and one admin per site', async () => {
    const t = await makeTestApp();
    const personas = await json<Persona[]>(await send(t, 'GET', '/api/auth/personas'));
    expect(personas).toHaveLength(4);
    expect(personas.map((p) => p.id)).toEqual(
      expect.arrayContaining([WORKER_SKYLINE, ADMIN_SKYLINE, 'worker-greenfield-1', 'admin-greenfield']),
    );
    expect(personas.filter((p) => p.role === 'admin')).toHaveLength(2);
  });
});

describe('demo login and session', () => {
  it('sets an httpOnly session cookie and returns Me', async () => {
    const t = await makeTestApp();
    const res = await send(t, 'POST', '/api/auth/demo', { body: { personaId: WORKER_SKYLINE } });
    expect(res.status).toBe(200);

    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(/^fs_session=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).toMatch(/Max-Age=43200/);
    expect(setCookie).not.toMatch(/Secure/i);

    const me = await json<Me>(res);
    expect(me.id).toBe(WORKER_SKYLINE);
    expect(me.role).toBe('worker');
    expect(me.site.id).toBe('site-skyline');
  });

  it('adds Secure to the cookie in production mode', async () => {
    const t = await makeTestApp({ secureCookies: true });
    const res = await send(t, 'POST', '/api/auth/demo', { body: { personaId: ADMIN_SKYLINE } });
    expect(res.headers.get('set-cookie')).toMatch(/Secure/i);
  });

  it('rejects an unknown persona with 404', async () => {
    const t = await makeTestApp();
    const res = await send(t, 'POST', '/api/auth/demo', { body: { personaId: 'nobody' } });
    expect(res.status).toBe(404);
    expect(await json<{ error: string }>(res)).toHaveProperty('error');
  });

  it('rejects a malformed demo body with 400', async () => {
    const t = await makeTestApp();
    const res = await send(t, 'POST', '/api/auth/demo', { body: { personaId: 42 } });
    expect(res.status).toBe(400);
  });

  it('returns 401 on /api/me for anonymous requests and 200 with a session', async () => {
    const t = await makeTestApp();
    expect((await send(t, 'GET', '/api/me')).status).toBe(401);

    const cookie = await login(t, WORKER_SKYLINE);
    const res = await send(t, 'GET', '/api/me', { cookie });
    expect(res.status).toBe(200);
    expect((await json<Me>(res)).name).toBe('Ravi Kumar');
  });

  it('treats a tampered session token as anonymous', async () => {
    const t = await makeTestApp();
    const cookie = await login(t, WORKER_SKYLINE);
    const tampered = `${cookie.slice(0, -4)}AAAA`;
    expect((await send(t, 'GET', '/api/me', { cookie: tampered })).status).toBe(401);
  });

  it('expires the session after 12 hours on the injected clock', async () => {
    const t = await makeTestApp();
    const cookie = await login(t, WORKER_SKYLINE);
    t.clock.now = new Date(t.clock.now.getTime() + 13 * 60 * 60 * 1000);
    expect((await send(t, 'GET', '/api/me', { cookie })).status).toBe(401);
  });

  it('logout returns ok and expires the cookie', async () => {
    const t = await makeTestApp();
    const cookie = await login(t, WORKER_SKYLINE);
    const res = await send(t, 'POST', '/api/auth/logout', { cookie });
    expect(res.status).toBe(200);
    expect(await json<{ ok: boolean }>(res)).toEqual({ ok: true });
    expect(res.headers.get('set-cookie')).toMatch(/fs_session=;/);
  });
});

describe('role enforcement', () => {
  it('returns 401 for anonymous admin requests', async () => {
    const t = await makeTestApp();
    expect((await send(t, 'GET', '/api/admin/overview')).status).toBe(401);
    expect((await send(t, 'GET', '/api/attendance/me')).status).toBe(401);
  });

  it('returns 403 when a worker calls admin routes', async () => {
    const t = await makeTestApp();
    const cookie = await login(t, WORKER_SKYLINE);
    expect((await send(t, 'GET', '/api/admin/overview', { cookie })).status).toBe(403);
    expect((await send(t, 'GET', '/api/admin/workers', { cookie })).status).toBe(403);
  });

  it('returns 403 when an admin calls worker routes', async () => {
    const t = await makeTestApp();
    const cookie = await login(t, ADMIN_SKYLINE);
    expect((await send(t, 'GET', '/api/attendance/me', { cookie })).status).toBe(403);
    expect((await send(t, 'GET', '/api/pay/me', { cookie })).status).toBe(403);
  });
});
