// @vitest-environment jsdom
import { render, screen, act, cleanup, fireEvent } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { currentRoute, navigate, navigateLink, useRoute } from '../../src/web/router';

const originalTransition = Object.getOwnPropertyDescriptor(document, 'startViewTransition');

function RouteProbe() {
  const route = useRoute();
  return (
    <div>
      <span data-testid="path">{route.path}</span>
      <span data-testid="code">{route.query.get('code') ?? 'none'}</span>
    </div>
  );
}

afterEach(() => {
  cleanup();
  window.location.hash = '';
  if (originalTransition) Object.defineProperty(document, 'startViewTransition', originalTransition);
  else Reflect.deleteProperty(document, 'startViewTransition');
});

describe('router', () => {
  it('parses the path and query from the hash', () => {
    window.location.hash = '#/track?code=ABCD-EFGH';
    const route = currentRoute();
    expect(route.path).toBe('/track');
    expect(route.query.get('code')).toBe('ABCD-EFGH');
  });

  it('treats an empty hash as the start page and strips trailing slashes', () => {
    window.location.hash = '';
    expect(currentRoute().path).toBe('/');
    window.location.hash = '#/w/pay/';
    expect(currentRoute().path).toBe('/w/pay');
  });

  it('navigate() sets the hash and accepts paths with or without a leading slash', () => {
    navigate('/w/pay');
    expect(window.location.hash).toBe('#/w/pay');
    navigate('verify?token=abc');
    expect(window.location.hash).toBe('#/verify?token=abc');
  });

  it('useRoute() re-renders when the hash changes', async () => {
    window.location.hash = '#/';
    render(<RouteProbe />);
    expect(screen.getByTestId('path').textContent).toBe('/');

    await act(() => navigate('/track?code=XYZ'));
    await act(() => {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(screen.getByTestId('path').textContent).toBe('/track');
    expect(screen.getByTestId('code').textContent).toBe('XYZ');
  });

  it('coordinates an ordinary internal link through one native page transition', async () => {
    window.location.hash = '#/w';
    const start = vi.fn((update: () => void) => {
      update();
      return { ready: Promise.resolve(), finished: Promise.resolve() };
    });
    Object.defineProperty(document, 'startViewTransition', { configurable: true, value: start });
    render(<><RouteProbe /><a href="#/w/pay" onClick={navigateLink}>Pay</a></>);
    await act(() => { fireEvent.click(screen.getByRole('link', { name: 'Pay' })); });
    expect(start).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('path').textContent).toBe('/w/pay');
    expect(document.documentElement.dataset.navigationDirection).toBe('forward');
    await act(() => navigate('/w'));
    expect(document.documentElement.dataset.navigationDirection).toBe('back');
  });

  it('does not intercept modified clicks', () => {
    window.location.hash = '#/w';
    render(<a href="#/w/pay" onClick={navigateLink}>Pay</a>);
    const link = screen.getByRole('link', { name: 'Pay' });
    expect(fireEvent.click(link, { ctrlKey: true })).toBe(true);
  });

  it('cleans up a page transition even when a filter changes before its animation finishes', async () => {
    window.location.hash = '#/a';
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => { finish = resolve; });
    Object.defineProperty(document, 'startViewTransition', { configurable: true, value: (update: () => void) => {
      update();
      return { ready: Promise.resolve(), finished };
    } });
    navigate('/a/reports');
    navigate('/a/reports?filter=all');
    await act(async () => { finish(); await finished; });
    expect(document.documentElement.classList.contains('is-page-transitioning')).toBe(false);
    expect(currentRoute().query.get('filter')).toBe('all');
  });

  it('holds the new snapshot until the loading placeholder is gone', async () => {
    window.location.hash = '#/w';
    let ready: Promise<void> = Promise.resolve();
    Object.defineProperty(document, 'startViewTransition', { configurable: true, value: (update: () => Promise<void>) => {
      ready = update();
      return { ready, finished: ready };
    } });
    render(<main id="main"><RouteProbe /><div class="skeleton-stack">Loading</div></main>);
    navigate('/w/pay');
    await act(async () => { await Promise.resolve(); });
    expect(document.documentElement.classList.contains('is-page-transitioning')).toBe(true);
    document.querySelector('.skeleton-stack')!.remove();
    await act(async () => { await ready; });
    expect(document.documentElement.classList.contains('is-page-transitioning')).toBe(false);
  });
});
