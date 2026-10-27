import { describe, expect, it } from 'vitest';
import { json, makeTestApp, send } from './harness';

describe('security headers', () => {
  it('sends a strict CSP and permissions policy', async () => {
    const t = await makeTestApp();
    const res = await send(t, 'GET', '/api/health');
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("style-src 'self'");
    expect(csp).toContain("img-src 'self' data:");
    expect(csp).toContain("media-src 'self' blob:");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");

    const permissions = res.headers.get('permissions-policy') ?? '';
    expect(permissions).toMatch(/camera=\(self\)/);
    expect(permissions).toMatch(/microphone=\(self\)/);
    expect(permissions).toMatch(/geolocation=\(self\)/);

    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
  });
});

describe('rate limiting', () => {
  it('allows 60 API requests per minute and then returns 429', async () => {
    const t = await makeTestApp();
    for (let i = 0; i < 60; i++) {
      expect((await send(t, 'GET', '/api/health')).status).toBe(200);
    }
    const limited = await send(t, 'GET', '/api/health');
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).not.toBeNull();
    expect(await json<{ error: string }>(limited)).toHaveProperty('error');
  });

  it('allows 10 report submissions per minute and then returns 429', async () => {
    const t = await makeTestApp();
    const body = { siteId: 'site-skyline', language: 'en', text: 'Loose cable near the lift shaft.' };
    for (let i = 0; i < 10; i++) {
      expect((await send(t, 'POST', '/api/reports', { body })).status).toBe(200);
    }
    expect((await send(t, 'POST', '/api/reports', { body })).status).toBe(429);
  });
});

describe('body size limit', () => {
  it('rejects bodies over 2 MB with 413', async () => {
    const t = await makeTestApp();
    const huge = { siteId: 'site-skyline', language: 'en', text: 'x'.repeat(3 * 1024 * 1024) };
    const res = await send(t, 'POST', '/api/reports', { body: huge });
    expect(res.status).toBe(413);
  });
});
