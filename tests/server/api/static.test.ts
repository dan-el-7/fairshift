import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../../src/server/app';
import { generatePassportKeys } from '../../../src/server/domain/passport';
import { createMemoryRepo } from '../../../src/server/store/memory';
import { fakeAi, NOW, SESSION_SECRET } from './harness';

describe('static web app', () => {
  let webRoot: string;
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    webRoot = mkdtempSync(join(tmpdir(), 'fairshift-web-'));
    mkdirSync(join(webRoot, 'assets'));
    writeFileSync(join(webRoot, 'index.html'), '<!doctype html><title>FairShift</title>');
    writeFileSync(join(webRoot, 'assets', 'index-abc123.css'), 'body{}');
    const keys = generatePassportKeys();
    app = createApp({
      repo: createMemoryRepo(),
      ai: fakeAi,
      config: {
        sessionSecret: SESSION_SECRET,
        secureCookies: false,
        passport: { privateKey: keys.privateKey, publicKey: keys.publicKey, publicPem: keys.publicPem },
      },
      now: () => NOW,
      webRoot,
    });
  });

  afterAll(() => rmSync(webRoot, { recursive: true, force: true }));

  it('revalidates the page so a new deploy is picked up', async () => {
    const res = await app.request('/');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-cache');
  });

  it('serves the SPA shell for client routes without long caching', async () => {
    const res = await app.request('/some/client/route');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('FairShift');
    expect(res.headers.get('cache-control')).toBe('no-cache');
  });

  it('caches hashed build assets for a year', async () => {
    const res = await app.request('/assets/index-abc123.css');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
  });

  it('leaves API responses uncached by this rule', async () => {
    const res = await app.request('/api/health');
    expect(res.headers.get('cache-control') ?? '').not.toContain('immutable');
  });
});
