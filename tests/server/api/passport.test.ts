import { describe, expect, it } from 'vitest';
import type { PassportMe, PassportVerify } from '../../../src/shared/api';
import { WORKER_SKYLINE, json, login, makeTestApp, send } from './harness';

/**
 * Changes one character in the middle of the signature segment. Not the last character: its
 * low bits are base64 padding and do not change the decoded signature.
 */
function tamper(token: string): string {
  const idx = token.indexOf('.') + 10;
  const ch = token.charAt(idx);
  return `${token.slice(0, idx)}${ch === 'A' ? 'B' : 'A'}${token.slice(idx + 1)}`;
}

describe('skill passport', () => {
  it('returns the worker entries and a signed share token', async () => {
    const t = await makeTestApp();
    const cookie = await login(t, WORKER_SKYLINE);
    const res = await send(t, 'GET', '/api/passport/me', { cookie });
    expect(res.status).toBe(200);
    const passport = await json<PassportMe>(res);
    expect(passport.entries.length).toBeGreaterThanOrEqual(2);
    expect(passport.entries.every((e) => e.workerId === WORKER_SKYLINE)).toBe(true);
    expect(passport.shareToken).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });

  it('verifies a genuine share token and returns its payload without the worker id', async () => {
    const t = await makeTestApp();
    const cookie = await login(t, WORKER_SKYLINE);
    const passport = await json<PassportMe>(await send(t, 'GET', '/api/passport/me', { cookie }));

    const res = await send(t, 'GET', `/api/passport/verify?token=${encodeURIComponent(passport.shareToken)}`);
    expect(res.status).toBe(200);
    const verdict = await json<PassportVerify>(res);
    expect(verdict.valid).toBe(true);
    expect(verdict.payload?.workerName).toBe('Ravi Kumar');
    expect(verdict.payload?.entries.length).toBe(passport.entries.length);
    expect(JSON.stringify(verdict.payload)).not.toContain(WORKER_SKYLINE);
  });

  it('rejects a tampered share token', async () => {
    const t = await makeTestApp();
    const cookie = await login(t, WORKER_SKYLINE);
    const passport = await json<PassportMe>(await send(t, 'GET', '/api/passport/me', { cookie }));
    const res = await send(t, 'GET', `/api/passport/verify?token=${encodeURIComponent(tamper(passport.shareToken))}`);
    expect(await json<PassportVerify>(res)).toEqual({ valid: false });
  });

  it('rejects a token with the payload altered', async () => {
    const t = await makeTestApp();
    const cookie = await login(t, WORKER_SKYLINE);
    const passport = await json<PassportMe>(await send(t, 'GET', '/api/passport/me', { cookie }));
    const [, signature] = passport.shareToken.split('.');
    const forgedBody = Buffer.from(JSON.stringify({ workerName: 'Someone Else', entries: [], issuedAt: 'x' })).toString(
      'base64url',
    );
    const res = await send(t, 'GET', `/api/passport/verify?token=${forgedBody}.${signature ?? ''}`);
    expect(await json<PassportVerify>(res)).toEqual({ valid: false });
  });

  it('requires a token parameter', async () => {
    const t = await makeTestApp();
    expect((await send(t, 'GET', '/api/passport/verify')).status).toBe(400);
  });

  it('serves the public key as PEM text', async () => {
    const t = await makeTestApp();
    const res = await send(t, 'GET', '/api/passport/public-key');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/plain/);
    expect(await res.text()).toContain('BEGIN PUBLIC KEY');
  });

  it('requires a worker session for the personal passport', async () => {
    const t = await makeTestApp();
    expect((await send(t, 'GET', '/api/passport/me')).status).toBe(401);
  });
});
