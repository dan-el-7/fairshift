import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { clientIp } from '../../../src/server/middleware/security';

const app = new Hono().get('/', (c) => c.text(clientIp(c)));

/** The address the rate limiter would use for a request with these headers. */
async function ipFor(headers: Record<string, string>): Promise<string> {
  return (await app.request('/', { headers })).text();
}

describe('clientIp precedence', () => {
  it('prefers X-Real-IP', async () => {
    expect(
      await ipFor({ 'x-real-ip': '1.1.1.1', 'x-vercel-forwarded-for': '2.2.2.2', 'x-forwarded-for': '3.3.3.3, 4.4.4.4' }),
    ).toBe('1.1.1.1');
  });

  it('then X-Vercel-Forwarded-For', async () => {
    expect(await ipFor({ 'x-vercel-forwarded-for': '2.2.2.2', 'x-forwarded-for': '3.3.3.3' })).toBe('2.2.2.2');
  });

  it('then the first hop of X-Forwarded-For', async () => {
    expect(await ipFor({ 'x-forwarded-for': ' 3.3.3.3 , 4.4.4.4' })).toBe('3.3.3.3');
  });

  it('is unknown without any of these headers', async () => {
    expect(await ipFor({})).toBe('unknown');
  });
});
