import { generateKeyPairSync, sign, verify, type KeyObject } from 'node:crypto';
import { z } from 'zod';
import type { PassportPayload } from '../../shared/types';

const entrySchema = z.object({
  id: z.string(),
  kind: z.enum(['training', 'certification', 'experience']),
  title: z.string(),
  issuer: z.string(),
  issuedOn: z.string(),
  hours: z.number().optional(),
  industry: z.enum(['construction', 'college']),
});

const payloadSchema = z.object({
  workerName: z.string(),
  entries: z.array(entrySchema),
  issuedAt: z.string(),
});

/** Signs a skill passport. Token is `base64url(JSON).base64url(ed25519 signature over the first segment)`. */
export function signPassport(payload: PassportPayload, privateKey: KeyObject): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = sign(null, Buffer.from(body, 'utf8'), privateKey).toString('base64url');
  return `${body}.${signature}`;
}

/**
 * Verifies a passport token offline. Returns the payload when the signature is valid and the
 * body matches the schema; returns null for any malformed or tampered input. Never throws.
 */
export function verifyPassport(token: string, publicKey: KeyObject): PassportPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [body, signature] = parts as [string, string];
    const ok = verify(null, Buffer.from(body, 'utf8'), publicKey, Buffer.from(signature, 'base64url'));
    if (!ok) return null;
    const json: unknown = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    const parsed = payloadSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Generates an Ed25519 key pair for signing passports, as KeyObjects and PEM strings. */
export function generatePassportKeys(): {
  privateKey: KeyObject;
  publicKey: KeyObject;
  privatePem: string;
  publicPem: string;
} {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    privateKey,
    publicKey,
    privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    publicPem: publicKey.export({ type: 'spki', format: 'pem' }),
  };
}
