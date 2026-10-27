import { createHmac, timingSafeEqual } from 'node:crypto';

const WINDOW_SECONDS = 60;
const MAC_HEX_LENGTH = 16;

function windowOf(now: Date): number {
  return Math.floor(Math.floor(now.getTime() / 1000) / WINDOW_SECONDS);
}

function macFor(siteId: string, window: number, secret: string): string {
  return createHmac('sha256', secret).update(`${siteId}.${window}`).digest('hex').slice(0, MAC_HEX_LENGTH);
}

/** Builds the rotating kiosk QR token `${siteId}.${window}.${hmac16}` for the current 60 s window. */
export function qrToken(siteId: string, secret: string, now: Date): string {
  const window = windowOf(now);
  return `${siteId}.${window}.${macFor(siteId, window, secret)}`;
}

/**
 * Verifies a QR token. Accepts the current or the immediately previous 60 s window only.
 * Returns the site id on success, otherwise null. The MAC comparison is constant-time.
 */
export function verifyQrToken(token: string, secret: string, now: Date): string | null {
  const parts = token.split('.');
  if (parts.length < 3) return null;
  const mac = parts[parts.length - 1] ?? '';
  const windowText = parts[parts.length - 2] ?? '';
  const siteId = parts.slice(0, -2).join('.');
  if (siteId.length === 0 || !/^\d+$/.test(windowText) || mac.length !== MAC_HEX_LENGTH) return null;

  const window = Number(windowText);
  const current = windowOf(now);
  if (window !== current && window !== current - 1) return null;

  const expected = Buffer.from(macFor(siteId, window, secret), 'utf8');
  const given = Buffer.from(mac, 'utf8');
  if (expected.length !== given.length) return null;
  return timingSafeEqual(expected, given) ? siteId : null;
}
