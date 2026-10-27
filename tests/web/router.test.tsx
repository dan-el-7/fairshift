// @vitest-environment jsdom
import { render, screen, act, cleanup } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { currentRoute, navigate, useRoute } from '../../src/web/router';

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
});
