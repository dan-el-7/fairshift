import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../../src/server/app';
import { heuristicAi } from '../../../src/server/services/ai';
import { createMemoryRepo } from '../../../src/server/store/memory';
import { loadConfig } from '../../../src/server/config';

interface VercelConfig {
  headers: { source: string; headers: { key: string; value: string }[] }[];
}

const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as VercelConfig;
const documentRule = vercel.headers.find((rule) => rule.source === '/((?!api/).*)');
const header = (key: string) => documentRule?.headers.find((h) => h.key === key)?.value;

/** On Vercel the HTML is served statically, outside Hono, so vercel.json must carry the same policy. */
describe('vercel.json document headers', () => {
  it('match the headers the API sends', async () => {
    const app = createApp({ repo: createMemoryRepo(), ai: heuristicAi(), config: loadConfig({}) });
    const res = await app.request('/api/health');

    for (const key of ['Content-Security-Policy', 'Permissions-Policy', 'Referrer-Policy', 'X-Frame-Options']) {
      expect(header(key), key).toBe(res.headers.get(key));
    }
    expect(header('X-Content-Type-Options')).toBe('nosniff');
  });

  it('cover every path except the API', () => {
    const pattern = new RegExp(`^${documentRule?.source ?? '$^'}$`);
    expect(pattern.test('/')).toBe(true);
    expect(pattern.test('/worker/report')).toBe(true);
    expect(pattern.test('/api/health')).toBe(false);
  });
});
