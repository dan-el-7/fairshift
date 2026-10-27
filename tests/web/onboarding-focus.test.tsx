// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/web/app';
import { resetSessionForTests } from '../../src/web/session';
import { mockFetch, personas, reply } from './helpers';

beforeEach(() => {
  localStorage.clear();
  resetSessionForTests();
  window.location.hash = '#/';
  mockFetch({ '/api/auth/personas': personas, '/api/me': reply(401, { error: 'no' }) });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  window.location.hash = '';
});

describe('focus when onboarding closes', () => {
  it('moves focus to the page content after Skip', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Skip' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(document.querySelector('main'));
  });

  it('moves focus to the page content after Escape', async () => {
    render(<App />);
    await screen.findByRole('dialog');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(document.querySelector('main'));
  });
});
