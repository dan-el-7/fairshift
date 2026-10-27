// @vitest-environment jsdom
import { render, cleanup, waitFor, screen } from '@testing-library/preact';
import axe from 'axe-core';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/web/app';
import { resetSessionForTests } from '../../src/web/session';
import { emptyAttendance, mockFetch, personas, payslip, reply, worker } from './helpers';

/** Runs axe on the container and returns violation summaries. Only the colour-contrast rule is disabled. */
async function violations(container: Element) {
  const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`);
}

beforeAll(() => {
  document.title = 'FairShift';
});

beforeEach(() => {
  resetSessionForTests();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.location.hash = '';
});

describe('accessibility (axe-core, colour contrast excluded)', () => {
  it('landing page has no violations', async () => {
    mockFetch({ '/api/auth/personas': personas, '/api/me': reply(401, { error: 'no' }) });
    window.location.hash = '#/';
    const { container } = render(<App />);
    await screen.findByText('Ravi Kumar', undefined, { timeout: 5000 });
    expect(await violations(container)).toEqual([]);
  });

  it('worker home has no violations', async () => {
    mockFetch({
      '/api/me': worker,
      '/api/attendance/me': { ...emptyAttendance, fatigue: [{ rule: 'long_shift', severity: 'high', detail: { hours: 13 }, at: '2026-10-27T00:00:00Z' }] },
    });
    window.location.hash = '#/w';
    const { container } = render(<App />);
    await screen.findByText('You worked 13 hours in one shift. Please rest and tell your supervisor.', undefined, { timeout: 5000 });
    expect(await violations(container)).toEqual([]);
  });

  it('payslip has no violations', async () => {
    mockFetch({ '/api/me': worker, '/api/pay/me': payslip, '/api/attendance/me': emptyAttendance });
    window.location.hash = '#/w/pay';
    const { container } = render(<App />);
    await waitFor(() => expect(screen.getByText('22 days × ₹750.00')).toBeTruthy());
    expect(await violations(container)).toEqual([]);
  });
});
