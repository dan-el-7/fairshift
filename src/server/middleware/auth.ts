import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { sign, verify } from 'hono/jwt';
import type { Role } from '../../shared/types';

export const SESSION_COOKIE = 'fs_session';
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

/** The signed-in identity, taken from the session token. */
export interface SessionUser {
  id: string;
  role: Role;
  siteId: string;
}

/** Hono environment shared by all API routes: `c.var.user` is null for anonymous requests. */
export interface AppEnv {
  Variables: {
    user: SessionUser | null;
  };
}

/**
 * Issues the httpOnly session cookie with an HS256 JWT `{ sub, role, siteId, exp }`.
 * Expiry is set from the injected clock; verification re-checks it against the same clock.
 */
export async function issueSession(
  c: Context<AppEnv>,
  secret: string,
  user: SessionUser,
  now: Date,
  secureCookie: boolean,
): Promise<void> {
  const exp = Math.floor(now.getTime() / 1000) + SESSION_TTL_SECONDS;
  const token = await sign({ sub: user.id, role: user.role, siteId: user.siteId, exp }, secret, 'HS256');
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: secureCookie,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

/** Expires the session cookie. */
export function clearSession(c: Context<AppEnv>, secureCookie: boolean): void {
  deleteCookie(c, SESSION_COOKIE, { path: '/', httpOnly: true, secure: secureCookie, sameSite: 'Lax' });
}

/** Verifies the session token. Returns null for missing, malformed, tampered or expired tokens. */
export async function readSession(
  c: Context<AppEnv>,
  secret: string,
  now: Date,
): Promise<SessionUser | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  try {
    // exp is checked below against the injected clock rather than Date.now().
    const payload = await verify(token, secret, { alg: 'HS256', exp: false });
    const nowSec = Math.floor(now.getTime() / 1000);
    if (typeof payload.exp !== 'number' || payload.exp <= nowSec) return null;
    const { sub, role, siteId } = payload;
    if (typeof sub !== 'string' || typeof siteId !== 'string') return null;
    if (role !== 'worker' && role !== 'admin') return null;
    return { id: sub, role, siteId };
  } catch {
    return null;
  }
}

/** Sets `c.var.user` on every API request. Never rejects on its own. */
export function sessionMiddleware(secret: string, now: () => Date): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    c.set('user', await readSession(c, secret, now()));
    await next();
  };
}

/** Allows only signed-in users with the given role. 401 when anonymous, 403 for the wrong role. */
export function requireRole(role: Role): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get('user');
    if (!user) return c.json({ error: 'sign in required' }, 401);
    if (user.role !== role) return c.json({ error: 'not allowed for this role' }, 403);
    await next();
    return;
  };
}
