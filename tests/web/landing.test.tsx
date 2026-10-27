// @vitest-environment jsdom
import { fireEvent, render, screen, cleanup, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/web/app';
import { hasSeenIntro, markIntroSeen, markOnboarded } from '../../src/web/components/Onboarding';
import { resetSessionForTests } from '../../src/web/session';
import { mockFetch, personas, reply, worker } from './helpers';

beforeEach(() => {
  resetSessionForTests();
  window.location.hash = '#/';
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.location.hash = '';
});

describe('landing page', () => {
  it('renders the demo personas from GET /api/auth/personas', async () => {
    const fetchMock = mockFetch({ '/api/auth/personas': personas, '/api/me': reply(401, { error: 'no' }) });

    render(<App />);

    expect(await screen.findByText('Ravi Kumar')).toBeTruthy();
    expect(screen.getByText('Meera Admin')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/personas', expect.anything());
  });

  it('offers the language picker with native-script labels', async () => {
    mockFetch({ '/api/auth/personas': personas, '/api/me': reply(401, { error: 'no' }) });

    render(<App />);

    expect(await screen.findByRole('button', { name: 'हिन्दी' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'தமிழ்' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'English' })).toBeTruthy();
  });

  it('logs in with the chosen persona and goes to the worker home', async () => {
    const fetchMock = mockFetch({
      '/api/auth/personas': personas,
      '/api/auth/demo': worker,
      '/api/me': reply(401, { error: 'no' }),
      '/api/attendance/me': { open: null, recent: [], fatigue: [] },
    });

    render(<App />);
    fireEvent.click(await screen.findByText('Ravi Kumar'));

    await waitFor(() => expect(window.location.hash).toBe('#/w'));
    const demoCall = fetchMock.mock.calls.find(([url]) => url === '/api/auth/demo');
    expect(JSON.parse(demoCall?.[1]?.body as string)).toEqual({ personaId: 'worker-ravi' });
  });

  it('replays the role tour on a demo login, even when it was seen before', async () => {
    markOnboarded();
    markIntroSeen('worker');
    mockFetch({
      '/api/auth/personas': personas,
      '/api/auth/demo': worker,
      '/api/me': reply(401, { error: 'no' }),
      '/api/attendance/me': { open: null, recent: [], fatigue: [] },
    });

    render(<App />);
    fireEvent.click(await screen.findByText('Ravi Kumar'));

    await waitFor(() => expect(document.querySelector('.ob-root')).not.toBeNull());
    expect(hasSeenIntro('worker')).toBe(false);
    localStorage.clear();
  });
});
