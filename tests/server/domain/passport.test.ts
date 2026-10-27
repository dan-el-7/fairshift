import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { PassportPayload } from '../../../src/shared/types';
import {
  generatePassportKeys,
  signPassport,
  verifyPassport,
} from '../../../src/server/domain/passport';

const payload: PassportPayload = {
  workerName: 'Ravi Kumar',
  entries: [
    {
      id: 'p1',
      kind: 'training',
      title: 'Working at Heights',
      issuer: 'Skyline Safety Academy',
      issuedOn: '2024-01-05',
      hours: 16,
      industry: 'construction',
    },
    {
      id: 'p2',
      kind: 'experience',
      title: 'Mason',
      issuer: 'Skyline Towers',
      issuedOn: '2023-06-01',
      industry: 'construction',
    },
  ],
  issuedAt: '2024-01-10T10:00:00.000Z',
};

describe('passport signing', () => {
  const keys = generatePassportKeys();

  it('round-trips a signed payload through verifyPassport', () => {
    const token = signPassport(payload, keys.privateKey);
    expect(verifyPassport(token, keys.publicKey)).toEqual(payload);
  });

  it('produces a two-segment base64url token', () => {
    const token = signPassport(payload, keys.privateKey);
    const parts = token.split('.');
    expect(parts).toHaveLength(2);
    for (const part of parts) expect(part).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('keeps the JSON payload readable in the first segment', () => {
    const token = signPassport(payload, keys.privateKey);
    const body = JSON.parse(Buffer.from(token.split('.')[0] ?? '', 'base64url').toString('utf8'));
    expect(body).toEqual(payload);
  });

  it('rejects a token whose payload was altered', () => {
    const [body, sig] = signPassport(payload, keys.privateKey).split('.') as [string, string];
    const tampered = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    tampered.workerName = 'Someone Else';
    const forged = `${Buffer.from(JSON.stringify(tampered)).toString('base64url')}.${sig}`;
    expect(verifyPassport(forged, keys.publicKey)).toBeNull();
  });

  it('rejects a token whose signature was altered', () => {
    const [body, sig] = signPassport(payload, keys.privateKey).split('.') as [string, string];
    const flipped = sig.slice(0, -2) + (sig.endsWith('AA') ? 'BB' : 'AA');
    expect(verifyPassport(`${body}.${flipped}`, keys.publicKey)).toBeNull();
  });

  it('rejects a token signed by a different key', () => {
    const other = generatePassportKeys();
    expect(verifyPassport(signPassport(payload, other.privateKey), keys.publicKey)).toBeNull();
  });

  it('rejects a validly signed body that does not match the payload schema', () => {
    const body = Buffer.from(JSON.stringify({ foo: 1 })).toString('base64url');
    const sig = sign(null, Buffer.from(body, 'utf8'), keys.privateKey).toString('base64url');
    expect(verifyPassport(`${body}.${sig}`, keys.publicKey)).toBeNull();
  });

  it('rejects a validly signed body that is not JSON', () => {
    const body = Buffer.from('not json at all').toString('base64url');
    const sig = sign(null, Buffer.from(body, 'utf8'), keys.privateKey).toString('base64url');
    expect(verifyPassport(`${body}.${sig}`, keys.publicKey)).toBeNull();
  });

  it('returns null for malformed tokens without throwing', () => {
    expect(verifyPassport('', keys.publicKey)).toBeNull();
    expect(verifyPassport('onlyonepart', keys.publicKey)).toBeNull();
    expect(verifyPassport('a.b.c', keys.publicKey)).toBeNull();
    expect(verifyPassport('!!!.???', keys.publicKey)).toBeNull();
    expect(verifyPassport('.', keys.publicKey)).toBeNull();
  });

  it('returns null when the key is not an Ed25519 public key', () => {
    const rsa = generateKeyPairSync('rsa', { modulusLength: 1024 }).publicKey;
    expect(verifyPassport(signPassport(payload, keys.privateKey), rsa)).toBeNull();
  });
});

describe('generatePassportKeys', () => {
  it('returns Ed25519 key objects and PEM strings', () => {
    const keys = generatePassportKeys();
    expect(keys.privateKey.asymmetricKeyType).toBe('ed25519');
    expect(keys.publicKey.asymmetricKeyType).toBe('ed25519');
    expect(keys.privatePem).toMatch(/^-----BEGIN PRIVATE KEY-----/);
    expect(keys.publicPem).toMatch(/^-----BEGIN PUBLIC KEY-----/);
  });

  it('generates a different pair each call', () => {
    expect(generatePassportKeys().publicPem).not.toBe(generatePassportKeys().publicPem);
  });
});
