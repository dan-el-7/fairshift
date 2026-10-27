import { describe, expect, it } from 'vitest';
import { qrToken, verifyQrToken } from '../../../src/server/domain/qrToken';

const secret = 'test-secret';
const siteId = 'site-skyline';
// Aligned to a minute boundary: epochSec 1704880800 / 60 = 28414680 exactly
const T = new Date('2024-01-10T10:00:00Z');
const plus = (sec: number): Date => new Date(T.getTime() + sec * 1000);

describe('qrToken', () => {
  it('has the form siteId.window.hmac16 with a 16-hex MAC', () => {
    expect(qrToken(siteId, secret, T)).toMatch(/^site-skyline\.\d+\.[0-9a-f]{16}$/);
  });

  it('uses window = floor(epochSeconds / 60)', () => {
    const token = qrToken(siteId, secret, T);
    expect(token.split('.')[1]).toBe(String(Math.floor(T.getTime() / 1000 / 60)));
  });

  it('is stable within one 60 s window and changes in the next', () => {
    expect(qrToken(siteId, secret, plus(59))).toBe(qrToken(siteId, secret, T));
    expect(qrToken(siteId, secret, plus(60))).not.toBe(qrToken(siteId, secret, T));
  });
});

describe('verifyQrToken', () => {
  it('accepts a token from the current window and returns the site id', () => {
    expect(verifyQrToken(qrToken(siteId, secret, T), secret, T)).toBe(siteId);
  });

  it('accepts a token from the previous window', () => {
    const token = qrToken(siteId, secret, T);
    expect(verifyQrToken(token, secret, plus(60))).toBe(siteId);
    expect(verifyQrToken(token, secret, plus(119))).toBe(siteId);
  });

  it('rejects a token from two windows ago', () => {
    const token = qrToken(siteId, secret, T);
    expect(verifyQrToken(token, secret, plus(120))).toBeNull();
  });

  it('rejects a token from a future window', () => {
    const token = qrToken(siteId, secret, plus(120));
    expect(verifyQrToken(token, secret, T)).toBeNull();
  });

  it('rejects a token whose MAC was altered', () => {
    const token = qrToken(siteId, secret, T);
    const last = token[token.length - 1];
    const flipped = token.slice(0, -1) + (last === '0' ? '1' : '0');
    expect(verifyQrToken(flipped, secret, T)).toBeNull();
  });

  it('rejects a token whose site id was swapped (MAC no longer matches)', () => {
    const token = qrToken(siteId, secret, T);
    const window = token.split('.')[1];
    const mac = token.split('.')[2];
    expect(verifyQrToken(`site-greenfield.${window}.${mac}`, secret, T)).toBeNull();
  });

  it('rejects a token signed with a different secret', () => {
    expect(verifyQrToken(qrToken(siteId, 'other-secret', T), secret, T)).toBeNull();
  });

  it('round-trips a site id that contains dots', () => {
    const dotted = 'block.a.1';
    expect(verifyQrToken(qrToken(dotted, secret, T), secret, T)).toBe(dotted);
  });

  it('returns null for malformed input instead of throwing', () => {
    const now = T;
    expect(verifyQrToken('', secret, now)).toBeNull();
    expect(verifyQrToken('site-skyline', secret, now)).toBeNull();
    expect(verifyQrToken('site-skyline.abc.0123456789abcdef', secret, now)).toBeNull();
    expect(verifyQrToken(`site-skyline.28414680.abc`, secret, now)).toBeNull();
    expect(verifyQrToken(`.28414680.0123456789abcdef`, secret, now)).toBeNull();
  });
});
