import type { Context, MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';

export const BODY_LIMIT_BYTES = 2 * 1024 * 1024;

/** Strict CSP and permissions policy. Self scripts and styles, data: images, blob: media. */
export const securityHeaders: MiddlewareHandler = secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'"],
    imgSrc: ["'self'", 'data:'],
    mediaSrc: ["'self'", 'blob:'],
    connectSrc: ["'self'"],
    fontSrc: ["'self'"],
    objectSrc: ["'none'"],
    frameAncestors: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
  },
  permissionsPolicy: {
    camera: ['self'],
    microphone: ['self'],
    geolocation: ['self'],
  },
  referrerPolicy: 'strict-origin-when-cross-origin',
  xFrameOptions: 'DENY',
});

/** Rejects request bodies over 2 MB with 413. */
export const bodySizeLimit: MiddlewareHandler = bodyLimit({
  maxSize: BODY_LIMIT_BYTES,
  onError: (c) => c.json({ error: 'request body too large' }, 413),
});

/**
 * Client address for rate limiting, in order: X-Real-IP, X-Vercel-Forwarded-For, the first hop
 * of X-Forwarded-For, then 'unknown'. Vercel sets these headers at its edge and overwrites any
 * client-supplied value. Other hosts must run behind a proxy that does the same, or a client can
 * send its own header and get a fresh rate-limit budget on every request.
 */
export function clientIp(c: Context): string {
  for (const header of ['x-real-ip', 'x-vercel-forwarded-for', 'x-forwarded-for']) {
    const ip = c.req.header(header)?.split(',')[0]?.trim();
    if (ip) return ip;
  }
  return 'unknown';
}

export interface RateLimitOptions {
  /** Separate counters per name, so a route can have its own budget. */
  name: string;
  /** Requests allowed per window. */
  limit: number;
  windowMs: number;
  now: () => Date;
}

/**
 * In-memory fixed-window rate limiter keyed by client IP. Returns 429 with Retry-After
 * once the budget for the current window is spent.
 */
export function rateLimit(options: RateLimitOptions): MiddlewareHandler {
  const counters = new Map<string, { window: number; count: number }>();

  return async (c, next) => {
    const nowMs = options.now().getTime();
    const window = Math.floor(nowMs / options.windowMs);

    if (counters.size > 10_000) {
      for (const [key, entry] of counters) {
        if (entry.window !== window) counters.delete(key);
      }
    }

    const key = `${options.name}|${clientIp(c)}`;
    const entry = counters.get(key);
    const current = entry?.window === window ? entry : { window, count: 0 };
    current.count += 1;
    counters.set(key, current);

    if (current.count > options.limit) {
      const retryAfter = Math.ceil(((window + 1) * options.windowMs - nowMs) / 1000);
      c.header('Retry-After', String(Math.max(1, retryAfter)));
      return c.json({ error: 'too many requests, slow down' }, 429);
    }
    await next();
    return;
  };
}
