import { useEffect, useState } from 'preact/hooks';
import { api } from './api';

/** How often live admin pages refresh while open. */
export const LIVE_REFRESH_MS = 10_000;

export interface ApiData<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  reload: () => void;
}

/**
 * Loads a GET endpoint. Pass null as the path to skip loading. Re-loads when the path changes.
 * With refreshMs, it also re-fetches quietly on that interval while the tab is visible, keeping the
 * current data on screen (no loading state), so dashboards pick up new reports without a reload.
 */
export function useApiData<T>(path: string | null, options: { refreshMs?: number } = {}): ApiData<T> {
  const { refreshMs } = options;
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<{ data?: T; error?: unknown; loading: boolean }>({
    loading: path !== null,
  });

  useEffect(() => {
    if (path === null) {
      setState({ loading: false });
      return;
    }
    let alive = true;
    setState({ loading: true });
    api
      .get<T>(path)
      .then((data) => {
        if (alive) setState({ data, loading: false });
      })
      .catch((error: unknown) => {
        if (alive) setState({ error, loading: false });
      });
    return () => {
      alive = false;
    };
  }, [path, tick]);

  useEffect(() => {
    if (path === null || !refreshMs) return undefined;
    let alive = true;
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      api
        .get<T>(path)
        .then((data) => {
          if (alive) setState({ data, loading: false });
        })
        .catch(() => undefined); // A failed background refresh keeps the last good data.
    }, refreshMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [path, refreshMs]);

  return { data: state.data, error: state.error, loading: state.loading, reload: () => setTick((n) => n + 1) };
}
