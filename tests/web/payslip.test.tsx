// @vitest-environment jsdom
import { render, screen, cleanup, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/web/app';
import { resetSessionForTests } from '../../src/web/session';
import { setLang } from '../../src/web/i18n';
import { emptyAttendance, mockFetch, payslip, reply, worker } from './helpers';

beforeEach(() => {
  resetSessionForTests();
  window.location.hash = '#/w/pay';
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setLang('en');
  window.location.hash = '';
});

describe('payslip page', () => {
  it('renders lines from templates with parameters, plus totals and net pay', async () => {
    const fetchMock = mockFetch({
      '/api/me': worker,
      '/api/pay/me': payslip,
      '/api/attendance/me': emptyAttendance,
    });

    render(<App />);

    expect(await screen.findByText('22 days × ₹750.00', undefined, { timeout: 5000 })).toBeTruthy();
    expect(screen.getByText('EPF (12% of base pay)')).toBeTruthy();
    // Base pay and gross are both ₹16,500.00; net is only shown once in the totals.
    expect(screen.getAllByText('₹16,500.00').length).toBe(2);
    expect(screen.getByText('₹14,576.25')).toBeTruthy();

    const payCall = fetchMock.mock.calls.find(([url]) => typeof url === 'string' && url.startsWith('/api/pay/me'));
    expect(payCall?.[0]).toMatch(/^\/api\/pay\/me\?period=\d{4}-\d{2}$/);
  });

  it('shows a friendly message when no payslip exists for the month', async () => {
    mockFetch({
      '/api/me': worker,
      '/api/pay/me': reply(404, { error: 'no payslip' }),
      '/api/attendance/me': emptyAttendance,
    });

    render(<App />);

    expect(await screen.findByText('There is no payslip for this month yet.', undefined, { timeout: 5000 })).toBeTruthy();
  });

  it('renders the payslip in the chosen language', async () => {
    setLang('hi');
    mockFetch({
      '/api/me': worker,
      '/api/pay/me': payslip,
      '/api/attendance/me': emptyAttendance,
    });

    render(<App />);

    await waitFor(() => expect(screen.getByText('22 दिन × ₹750.00')).toBeTruthy());
  });
});
