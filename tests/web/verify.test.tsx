// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PassportVerify } from '../../src/shared/api';
import Verify from '../../src/web/pages/public/Verify';
import { setLang } from '../../src/web/i18n';
import { mockFetch } from './helpers';

const verified: PassportVerify = {
  valid: true,
  payload: {
    workerName: 'Ravi Kumar',
    issuedAt: '2026-10-20T10:00:00.000Z',
    entries: [{ id: 'e1', kind: 'training', title: 'Scaffold safety', issuer: 'Skyline Academy', issuedOn: '2026-09-01', industry: 'construction' }],
  },
};

beforeEach(() => {
  setLang('en');
  window.location.hash = '#/verify?token=abc';
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.location.hash = '';
});

describe('verify result', () => {
  it('labels the result section with the id of the result heading', async () => {
    mockFetch({ '/api/passport/verify': verified });
    render(<Verify />);

    const valid = await screen.findByText('Valid passport');
    expect(valid.id).toBe('verify-result');
    const section = document.querySelector('section[aria-labelledby="verify-result"]');
    expect(section).toBeTruthy();
    expect(section?.contains(valid)).toBe(true);
    await waitFor(() => expect(screen.getByText('Scaffold safety')).toBeTruthy());
  });
});
