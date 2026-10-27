import { useEffect, useState } from 'preact/hooks';

export interface Route {
  /** Path without the leading "#", query removed, no trailing slash. "/" for the start page. */
  path: string;
  query: URLSearchParams;
}

function parseHash(hash: string): Route {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const q = raw.indexOf('?');
  let path = q >= 0 ? raw.slice(0, q) : raw;
  const query = new URLSearchParams(q >= 0 ? raw.slice(q + 1) : '');
  if (!path.startsWith('/')) path = `/${path}`;
  if (path.length > 1) path = path.replace(/\/+$/, '') || '/';
  return { path, query };
}

export function currentRoute(): Route {
  return parseHash(window.location.hash);
}

/** Go to a route such as "/w/pay" or "/track?code=ABCD-EFGH". */
export function navigate(to: string): void {
  const stripped = to.replace(/^#/, '');
  const target = `#${stripped.startsWith('/') ? stripped : `/${stripped}`}`;
  if (window.location.hash === target) return;
  window.location.hash = target;
}

/** The current route; re-renders on every hash change. */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(currentRoute);
  useEffect(() => {
    const sync = () =>
      setRoute((prev) => {
        const next = currentRoute();
        const same = next.path === prev.path && next.query.toString() === prev.query.toString();
        return same ? prev : next;
      });
    // Captured once: Preact may run this cleanup on a timer after unmount, when (in tests) the
    // global window can already be gone.
    const win = window;
    win.addEventListener('hashchange', sync);
    sync();
    return () => win.removeEventListener('hashchange', sync);
  }, []);
  return route;
}
