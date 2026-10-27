import type { Context } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../middleware/auth';

/** Returns a 400 response describing the first validation problem, without echoing input. */
function invalid(c: Context<AppEnv>, error: z.ZodError): Response {
  const issue = error.issues[0];
  const where = issue && issue.path.length > 0 ? issue.path.join('.') : 'request';
  return c.json({ error: `invalid ${where}` }, 400);
}

/**
 * Parses and validates a JSON body. Returns the typed data, or a 400 Response to return as-is.
 * Check the result with `instanceof Response`.
 */
export async function parseBody<S extends z.ZodType>(
  c: Context<AppEnv>,
  schema: S,
): Promise<z.output<S> | Response> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: 'body must be JSON' }, 400);
  }
  const parsed = schema.safeParse(raw);
  return parsed.success ? (parsed.data) : invalid(c, parsed.error);
}

/** Parses and validates the query string. Same return convention as parseBody. */
export function parseQuery<S extends z.ZodType>(
  c: Context<AppEnv>,
  schema: S,
): z.output<S> | Response {
  const parsed = schema.safeParse(c.req.query());
  return parsed.success ? (parsed.data) : invalid(c, parsed.error);
}

/** JSON error body `{ error }` with the given status. */
export const jsonError = (c: Context<AppEnv>, status: 400 | 401 | 403 | 404 | 409 | 422 | 429, error: string): Response =>
  c.json({ error }, status);
