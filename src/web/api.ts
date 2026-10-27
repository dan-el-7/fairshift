import { t } from './i18n';
import { navigate } from './router';

/** An failed API call. `status` is 0 when the network request itself failed. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Fired on window when a request comes back 401, so session state can be cleared. */
export const SESSION_EXPIRED_EVENT = 'fairshift:session-expired';

interface RequestOptions {
  /** Default true. When false, a 401 is returned as an error without navigating away. */
  handleUnauthorized?: boolean;
}

async function request<T>(
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  if (!path.startsWith('/api/')) throw new Error(`API path must start with /api/: ${path}`);
  const headers: Record<string, string> = { Accept: 'application/json' };
  const init: RequestInit = { method, credentials: 'same-origin', headers };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError(0, 'Network error');
  }

  if (res.status === 401 && options.handleUnauthorized !== false) {
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    navigate('/');
  }

  const text = await res.text();
  let data: unknown;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = undefined;
    }
  }

  if (!res.ok) {
    const message =
      typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string'
        ? data.error
        : res.statusText || `HTTP ${res.status}`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}

/** Typed JSON client for the /api contract. Cookies are sent same-origin. */
export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown = {}) => request<T>('POST', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
};

/** GET that resolves to null on 401 and never redirects. Used for "am I logged in?" checks. */
export function tryGet<T>(path: string): Promise<T | null> {
  return request<T>('GET', path, undefined, { handleUnauthorized: false }).catch((err: unknown) => {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  });
}

/** A short, user-facing message for any thrown value. Never shows raw server text. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return t('error.network');
    if (err.status === 401) return t('error.session');
    if (err.status === 429) return t('error.rateLimit');
    if (err.status === 404) return t('error.notFound');
  }
  return t('error.generic');
}
