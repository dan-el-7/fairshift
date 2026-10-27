import { useEffect, useState } from 'preact/hooks';
import type { Me } from '../shared/api';
import { api, SESSION_EXPIRED_EVENT, tryGet } from './api';
import { navigate } from './router';

/** undefined = not checked yet, null = logged out, Me = logged in. */
let me: Me | null | undefined = undefined;
let pending: Promise<Me | null> | null = null;
const listeners = new Set<() => void>();

function publish(next: Me | null): void {
  me = next;
  listeners.forEach((fn) => fn());
}

export function setSession(next: Me | null): void {
  publish(next);
}

/** Loads GET /api/me once. Concurrent callers share one request. */
export function ensureSession(): Promise<Me | null> {
  if (me !== undefined) return Promise.resolve(me);
  if (!pending) {
    pending = tryGet<Me>('/api/me')
      .then((loaded) => {
        publish(loaded);
        return loaded;
      })
      .catch(() => {
        publish(null);
        return null;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

export async function logout(): Promise<void> {
  try {
    await api.post('/api/auth/logout', {});
  } catch {
    // Even if the server cannot be reached, forget the session on this device.
  }
  publish(null);
  navigate('/');
}

/** The current session: undefined while loading, null when logged out. Re-renders on change. */
export function useSession(): Me | null | undefined {
  const [value, setValue] = useState<Me | null | undefined>(me);
  useEffect(() => {
    const update = () => setValue(me);
    listeners.add(update);
    update();
    return () => {
      listeners.delete(update);
    };
  }, []);
  return value;
}

if (typeof window !== 'undefined') {
  window.addEventListener(SESSION_EXPIRED_EVENT, () => publish(null));
}

/** Test helper: forget any cached session. */
export function resetSessionForTests(): void {
  me = undefined;
  pending = null;
}
