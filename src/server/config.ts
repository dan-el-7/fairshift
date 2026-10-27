import { createPrivateKey, createPublicKey, randomBytes, type KeyObject } from 'node:crypto';
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

/** Full process configuration read from the environment. */
export interface ServerConfig extends AppConfig {
  port: number;
  store: 'memory' | 'firestore';
  /** Vertex AI is enabled when GOOGLE_CLOUD_PROJECT is set. */
  googleProject?: string;
  googleLocation: string;
  geminiModel: string;
  /** True when SESSION_SECRET was missing and a random per-boot secret was generated. */
  secretGenerated: boolean;
}

type Env = Record<string, string | undefined>;

/**
 * Reads server settings from the environment (see SPEC "Environment").
 * Never returns or logs secret values through any path other than the config object itself.
 */
export function loadConfig(env: Env = process.env): ServerConfig {
  const port = parsePort(env.PORT);
  const store = env.STORE === 'firestore' ? 'firestore' : parseStore(env.STORE);

  const providedSecret = env.SESSION_SECRET?.trim() ?? '';
  const secretGenerated = providedSecret.length === 0;
  const sessionSecret = secretGenerated ? randomBytes(32).toString('base64url') : providedSecret;

  const project = env.GOOGLE_CLOUD_PROJECT?.trim();

  return {
    port,
    store,
    sessionSecret,
    secretGenerated,
    secureCookies: env.NODE_ENV === 'production',
    googleProject: project && project.length > 0 ? project : undefined,
    googleLocation: env.GOOGLE_CLOUD_LOCATION?.trim() || 'us-central1',
    geminiModel: env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash',
    passport: loadPassportKeys(env.PASSPORT_PRIVATE_KEY),
  };
}

function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return 8080;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  return port;
}

function parseStore(raw: string | undefined): 'memory' {
  if (raw === undefined || raw.trim() === '' || raw === 'memory') return 'memory';
  throw new Error('STORE must be "memory" or "firestore"');
}

/** Uses PASSPORT_PRIVATE_KEY (Ed25519 PKCS8 PEM) when set, otherwise generates a key pair for this boot. */
function loadPassportKeys(raw: string | undefined): PassportKeys {
  const pem = raw?.trim().replace(/\\n/g, '\n') ?? '';
  if (pem.length === 0) {
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
    publicPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}
