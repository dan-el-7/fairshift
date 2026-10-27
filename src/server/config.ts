import { createPrivateKey, createPublicKey, hkdfSync, randomBytes, type KeyObject } from 'node:crypto';
import { generatePassportKeys } from './domain/passport';

/** Ed25519 key pair used to sign and verify skill passports. */
export interface PassportKeys {
  privateKey: KeyObject;
  publicKey: KeyObject;
  publicPem: string;
}

/** Settings the HTTP app needs. Tests build this directly. */
export interface AppConfig {
  sessionSecret: string;
  /** Adds the Secure attribute to the session cookie (production). */
  secureCookies: boolean;
  passport: PassportKeys;
}

export type StoreKind = 'memory' | 'firestore' | 'redis';

/** Full process configuration read from the environment. */
export interface ServerConfig extends AppConfig {
  port: number;
  store: StoreKind;
  /** Upstash Redis REST endpoint, set when the redis store is selected. */
  redis?: { url: string; token: string };
  /** Gemini Developer API key (GEMINI_API_KEY or GOOGLE_API_KEY). Takes precedence over Vertex AI. */
  geminiApiKey?: string;
  /** Vertex AI is enabled when GOOGLE_CLOUD_PROJECT is set and no API key is. */
  googleProject?: string;
  googleLocation: string;
  geminiModel: string;
  /** True when SESSION_SECRET was missing and a random per-boot secret was generated. */
  secretGenerated: boolean;
  /**
   * Public demo only: wipes ALL Redis data, including submitted reports, once per IST day.
   * When false the demo is seeded once and never cleared.
   */
  demoDailyReset: boolean;
}

type Env = Record<string, string | undefined>;

const PASSPORT_SALT = 'fairshift';
const PASSPORT_INFO = 'passport-ed25519';
/** PKCS#8 DER prefix for an Ed25519 private key; the 32-byte seed follows it. */
const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

/** Returns the value, or undefined when it is missing or empty. */
export function nonEmpty(value: string | undefined): string | undefined {
  return value === undefined || value === '' ? undefined : value;
}

/**
 * Derives a stable Ed25519 passport key from SESSION_SECRET, so every instance of a
 * multi-instance deployment (Vercel, Cloud Run) signs and verifies with the same key.
 */
export function derivePassportKeys(sessionSecret: string): PassportKeys {
  const seed = Buffer.from(
    hkdfSync('sha256', Buffer.from(sessionSecret, 'utf8'), Buffer.from(PASSPORT_SALT), Buffer.from(PASSPORT_INFO), 32),
  );
  const privateKey = createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8_PREFIX, seed]),
    format: 'der',
    type: 'pkcs8',
  });
  const publicKey = createPublicKey(privateKey);
  return { privateKey, publicKey, publicPem: publicKey.export({ type: 'spki', format: 'pem' }) };
}

/**
 * Reads server settings from the environment (see README "Environment").
 * Never returns or logs secret values through any path other than the config object itself.
 */
export function loadConfig(env: Env = process.env): ServerConfig {
  const port = parsePort(env.PORT);
  const { sessionSecret, secretGenerated } = resolveSessionSecret(env);
  const store = parseStore(env);

  return {
    port,
    store,
    redis: store === 'redis' ? parseRedis(env) : undefined,
    sessionSecret,
    secretGenerated,
    secureCookies: env.NODE_ENV === 'production',
    demoDailyReset: env.DEMO_DAILY_RESET?.trim() === 'true',
    geminiApiKey: nonEmpty(env.GEMINI_API_KEY?.trim()) ?? nonEmpty(env.GOOGLE_API_KEY?.trim()),
    googleProject: nonEmpty(env.GOOGLE_CLOUD_PROJECT?.trim()),
    googleLocation: nonEmpty(env.GOOGLE_CLOUD_LOCATION?.trim()) ?? 'us-central1',
    geminiModel: nonEmpty(env.GEMINI_MODEL?.trim()) ?? 'gemini-3.8-flash',
    passport: loadPassportKeys(env.PASSPORT_PRIVATE_KEY, secretGenerated ? undefined : sessionSecret),
  };
}

/** SESSION_SECRET when set. Otherwise a random per-boot secret, which serverless platforms refuse. */
function resolveSessionSecret(env: Env): { sessionSecret: string; secretGenerated: boolean } {
  const providedSecret = env.SESSION_SECRET?.trim() ?? '';
  const secretGenerated = providedSecret.length === 0;
  // Serverless and multi-instance platforms run several processes, each with its own random
  // secret. Logins, QR codes and feedback dedupe would then fail at random, so refuse to start.
  if (secretGenerated && (env.VERCEL || env.K_SERVICE)) {
    throw new Error(
      'SESSION_SECRET must be set on this platform (Vercel or Cloud Run): random per-instance secrets break logins. Generate one with `openssl rand -hex 32`.',
    );
  }
  const sessionSecret = secretGenerated ? randomBytes(32).toString('base64url') : providedSecret;
  return { sessionSecret, secretGenerated };
}

function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return 8080;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  return port;
}

/**
 * STORE wins when set. Otherwise a Redis REST endpoint (Vercel KV or Upstash names) selects
 * Redis, and the default is the in-memory store.
 */
function parseStore(env: Env): StoreKind {
  const raw = env.STORE?.trim() ?? '';
  if (raw === 'firestore' || raw === 'redis' || raw === 'memory') return raw;
  if (raw !== '') throw new Error('STORE must be "memory", "firestore" or "redis"');
  return redisEndpoint(env) ? 'redis' : 'memory';
}

function redisEndpoint(env: Env): { url: string; token: string } | undefined {
  const url = (nonEmpty(env.KV_REST_API_URL) ?? env.UPSTASH_REDIS_REST_URL)?.trim();
  const token = (nonEmpty(env.KV_REST_API_TOKEN) ?? env.UPSTASH_REDIS_REST_TOKEN)?.trim();
  return url && token ? { url, token } : undefined;
}

function parseRedis(env: Env): { url: string; token: string } {
  const endpoint = redisEndpoint(env);
  if (!endpoint) {
    throw new Error(
      'STORE=redis needs KV_REST_API_URL and KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN)',
    );
  }
  return endpoint;
}

/**
 * Uses PASSPORT_PRIVATE_KEY (Ed25519 PKCS8 PEM) when set. Otherwise derives a stable key from
 * SESSION_SECRET when one is provided. With neither, generates a key pair for this boot.
 */
function loadPassportKeys(raw: string | undefined, sessionSecret: string | undefined): PassportKeys {
  // Env hosts store the PEM on one line with literal backslash-n sequences; turn them into newlines.
  const pem = raw?.trim().replace(/\\n/g, '\n') ?? '';
  if (pem.length === 0) {
    if (sessionSecret !== undefined) return derivePassportKeys(sessionSecret);
    const generated = generatePassportKeys();
    return { privateKey: generated.privateKey, publicKey: generated.publicKey, publicPem: generated.publicPem };
  }

  let privateKey: KeyObject;
  try {
    privateKey = createPrivateKey(pem);
  } catch {
    throw new Error('PASSPORT_PRIVATE_KEY is not a valid PEM private key');
  }
  if (privateKey.asymmetricKeyType !== 'ed25519') {
    throw new Error('PASSPORT_PRIVATE_KEY must be an Ed25519 key');
  }
  const publicKey = createPublicKey(privateKey);
  return {
    privateKey,
    publicKey,
    publicPem: publicKey.export({ type: 'spki', format: 'pem' }),
  };
}
