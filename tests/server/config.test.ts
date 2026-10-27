import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { derivePassportKeys, loadConfig } from '../../src/server/config';
import { generatePassportKeys, signPassport, verifyPassport } from '../../src/server/domain/passport';

const SECRET = 'config-test-secret-with-enough-entropy-0123456789';
const OTHER_SECRET = 'a-different-secret-with-enough-entropy-98765';

describe('config on multi-instance platforms', () => {
  it('refuses to start on Vercel without SESSION_SECRET', () => {
    expect(() => loadConfig({ VERCEL: '1' })).toThrow(/SESSION_SECRET must be set/);
  });

  it('refuses to start on Cloud Run without SESSION_SECRET', () => {
    expect(() => loadConfig({ K_SERVICE: 'fairshift' })).toThrow(/SESSION_SECRET must be set/);
  });

  it('starts on Vercel when SESSION_SECRET is set', () => {
    const config = loadConfig({ VERCEL: '1', SESSION_SECRET: SECRET });
    expect(config.secretGenerated).toBe(false);
    expect(config.sessionSecret).toBe(SECRET);
  });

  it('still starts locally without a secret, using a random one', () => {
    const config = loadConfig({});
    expect(config.secretGenerated).toBe(true);
    expect(config.store).toBe('memory');
  });
});

describe('derived passport key', () => {
  it('is the same for the same SESSION_SECRET across loads', () => {
    const first = loadConfig({ SESSION_SECRET: SECRET }).passport.publicPem;
    const second = loadConfig({ SESSION_SECRET: SECRET }).passport.publicPem;
    expect(first).toBe(second);
    expect(first).toContain('BEGIN PUBLIC KEY');
  });

  it('differs for another SESSION_SECRET', () => {
    expect(loadConfig({ SESSION_SECRET: SECRET }).passport.publicPem).not.toBe(
      loadConfig({ SESSION_SECRET: OTHER_SECRET }).passport.publicPem,
    );
  });

  it('is an Ed25519 key that signs and verifies passports', () => {
    const keys = derivePassportKeys(SECRET);
    expect(keys.privateKey.asymmetricKeyType).toBe('ed25519');
    const payload = { workerName: 'Ravi', entries: [], issuedAt: '2026-10-27' };
    const token = signPassport(payload, keys.privateKey);
    expect(verifyPassport(token, derivePassportKeys(SECRET).publicKey)).toEqual(payload);
    expect(verifyPassport(token, derivePassportKeys(OTHER_SECRET).publicKey)).toBeNull();
  });

  it('is replaced by PASSPORT_PRIVATE_KEY when that is set', () => {
    const explicit = generatePassportKeys();
    const config = loadConfig({ SESSION_SECRET: SECRET, PASSPORT_PRIVATE_KEY: explicit.privatePem });
    expect(config.passport.publicPem).toBe(explicit.publicPem);
  });

  it('rejects a PASSPORT_PRIVATE_KEY that is not Ed25519', () => {
    expect(() => loadConfig({ PASSPORT_PRIVATE_KEY: 'not a key' })).toThrow(/PASSPORT_PRIVATE_KEY/);
  });
});

describe('store selection', () => {
  const KV = { KV_REST_API_URL: 'https://example.upstash.io', KV_REST_API_TOKEN: 'token-not-real' };

  it('selects Redis from the Vercel KV variables when STORE is unset', () => {
    const config = loadConfig({ ...KV });
    expect(config.store).toBe('redis');
    expect(config.redis).toEqual({ url: KV.KV_REST_API_URL, token: KV.KV_REST_API_TOKEN });
  });

  it('selects Redis from the Upstash variables', () => {
    const config = loadConfig({
      UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
      UPSTASH_REDIS_REST_TOKEN: 'token-not-real',
    });
    expect(config.store).toBe('redis');
  });

  it('keeps an explicit STORE over the detected endpoint', () => {
    expect(loadConfig({ ...KV, STORE: 'firestore' }).store).toBe('firestore');
  });

  it('refuses STORE=redis without an endpoint', () => {
    expect(() => loadConfig({ STORE: 'redis' })).toThrow(/KV_REST_API_URL/);
  });

  it('refuses an unknown STORE value', () => {
    expect(() => loadConfig({ STORE: 'postgres' })).toThrow(/STORE must be/);
  });

  it('reads GEMINI_API_KEY (or GOOGLE_API_KEY) for the Gemini client', () => {
    expect(loadConfig({ GEMINI_API_KEY: 'key-one' }).geminiApiKey).toBe('key-one');
    expect(loadConfig({ GOOGLE_API_KEY: 'key-two' }).geminiApiKey).toBe('key-two');
    expect(loadConfig({}).geminiApiKey).toBeUndefined();
  });
});

describe('PASSPORT_PRIVATE_KEY line breaks', () => {
  const { privateKey } = generateKeyPairSync('ed25519');
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });

  it('loads a PEM with real newlines', () => {
    const config = loadConfig({ PASSPORT_PRIVATE_KEY: pem, SESSION_SECRET: SECRET });
    expect(config.passport.publicPem).toContain('BEGIN PUBLIC KEY');
  });

  it('loads the same PEM when the newlines are literal backslash-n sequences', () => {
    const oneLine = pem.replace(/\n/g, '\n');
    const fromEscaped = loadConfig({ PASSPORT_PRIVATE_KEY: oneLine, SESSION_SECRET: SECRET });
    const fromReal = loadConfig({ PASSPORT_PRIVATE_KEY: pem, SESSION_SECRET: SECRET });
    expect(fromEscaped.passport.publicPem).toBe(fromReal.passport.publicPem);
  });
});

describe('demo daily reset flag', () => {
  it('is off by default and on only for the exact value "true"', () => {
    expect(loadConfig({}).demoDailyReset).toBe(false);
    expect(loadConfig({ DEMO_DAILY_RESET: 'false' }).demoDailyReset).toBe(false);
    expect(loadConfig({ DEMO_DAILY_RESET: 'true' }).demoDailyReset).toBe(true);
  });
});
