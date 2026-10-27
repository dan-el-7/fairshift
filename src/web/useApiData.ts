import { useEffect, useState } from 'preact/hooks';
import { api } from './api';

export interface ApiData<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  reload: () => void;
}

/** Loads a GET endpoint. Pass null as the path to skip loading. Re-loads when the path changes. */
export function useApiData<T>(path: string | null): ApiData<T> {
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

  return { data: state.data, error: state.error, loading: state.loading, reload: () => setTick((n) => n + 1) };
}
