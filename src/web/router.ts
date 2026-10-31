import { useEffect, useState } from 'preact/hooks';
import { flushSync } from 'preact/compat';

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

let navigationRevision = 0;
let currentTransition: ViewTransition | null = null;

/** Follow the order of the visible tabs, so moving back reverses the page slide. */
function navigationDirection(target: string): 'forward' | 'back' {
  const [area, section = ''] = currentRoute().path.split('/').filter(Boolean);
  const [nextArea, nextSection = ''] = parseHash(target).path.split('/').filter(Boolean);
  const sections = area === 'a' ? ['', 'reports', 'qr', 'workers', 'feedback'] : ['', 'attendance', 'pay', 'report', 'skills', 'feedback'];
  return area === nextArea && sections.includes(nextSection) && sections.indexOf(nextSection) < sections.indexOf(section)
    ? 'back' : 'forward';
}

/** Keep the old snapshot while a short API/chunk load settles, rather than fading to a skeleton. */
function contentReady(): Promise<void> {
  const main = document.getElementById('main');
  if (!main?.querySelector('.skeleton-stack')) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      observer.disconnect();
      window.clearTimeout(timeout);
      resolve();
    };
    const observer = new MutationObserver(() => {
      if (!main.querySelector('.skeleton-stack')) finish();
    });
    const timeout = window.setTimeout(finish, 650);
    observer.observe(main, { childList: true, subtree: true });
    if (!main.querySelector('.skeleton-stack')) finish();
  });
}

/** Commit one route inside the browser's old/new page snapshots. Fixed app chrome gets its own layer. */
function transitionTo(target: string): void {
  const revision = ++navigationRevision;
  const update = () => {
    if (revision !== navigationRevision) return;
    window.location.hash = target;
    // Native hashchange is asynchronous; flush every route subscriber before the new snapshot.
    flushSync(() => window.dispatchEvent(new HashChangeEvent('hashchange')));
  };
  const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const samePage = currentRoute().path === parseHash(target).path;
  if (reduced || samePage || typeof document.startViewTransition !== 'function' || document.querySelector('.ob-root')) {
    update();
    return;
  }
  const root = document.documentElement;
  root.dataset.navigationDirection = navigationDirection(target);
  root.classList.add('is-page-transitioning');
  try {
    const transition = document.startViewTransition(async () => {
      update();
      await contentReady();
    });
    currentTransition = transition;
    void transition.ready.catch(() => undefined); // A newer click can skip a snapshot; its route still commits.
    void transition.finished.finally(() => {
      if (currentTransition === transition) {
        currentTransition = null;
        root.classList.remove('is-page-transitioning');
      }
    }).catch(() => undefined);
  } catch {
    root.classList.remove('is-page-transitioning');
    update();
  }
}

/** Go to a route such as "/w/pay" or "/track?code=ABCD-EFGH". */
export function navigate(to: string): void {
  const stripped = to.replace(/^#/, '');
  const target = `#${stripped.startsWith('/') ? stripped : `/${stripped}`}`;
  if (window.location.hash === target) return;
  transitionTo(target);
}

/** Delegate normal internal link clicks. Modified clicks, downloads and external links keep browser behavior. */
export function navigateLink(event: MouseEvent): void {
  if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  const anchor = event.target instanceof Element ? event.target.closest('a') : null;
  const href = anchor?.getAttribute('href');
  if (!href?.startsWith('#/') || anchor?.target === '_blank' || anchor?.hasAttribute('download')) return;
  event.preventDefault();
  navigate(href);
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
