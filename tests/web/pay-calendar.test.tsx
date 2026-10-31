// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { DailyPay, PayCalendar } from '../../src/shared/types';
import Pay from '../../src/web/pages/worker/Pay';
import DaysOff from '../../src/web/pages/admin/DaysOff';
import { formatDay, setLang, t } from '../../src/web/i18n';
import { mockFetch, payslip, worker } from './helpers';
import { speak } from '../../src/web/speech';

vi.mock('../../src/web/speech', () => ({ speak: vi.fn() }));
const summary = { hours: 10, regularHours: 8, overtimeHours: 2, nightHours: 0, daysWorked: 1 };
const day: DailyPay = { day: '2026-10-26', summary, open: false, dayOff: 'Maintenance', base: 75000, overtime: 37500, night: 0, gross: 112500, pf: 9000, esi: 844, net: 102656 };
const calendar: PayCalendar = { month: '2026-10', today: '2026-10-31', monthlyAdjustment: -5000, days: [day, { ...day, day: '2026-10-27', summary: { ...summary, hours: 0, overtimeHours: 0 }, dayOff: undefined, gross: 0, net: 0 }] };

beforeEach(() => { setLang('en'); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-31T12:00:00Z')); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); setLang('en'); });

it('opens the calendar, selects dates, reads daily pay aloud, and preserves the monthly receipt for printing', async () => {
  mockFetch({ '/api/pay/me': payslip, '/api/pay/calendar': calendar });
  const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
  const { container } = render(<Pay me={worker} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Calendar' }));
  expect(await screen.findByText('Maintenance', { exact: false })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /^26 Oct 2026/ }));
  expect(screen.getByText('₹1,026.56')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Read aloud: 26 Oct 2026/ }));
  expect(speak).toHaveBeenCalledWith(expect.stringContaining('Overtime ₹375.00'), 'en');
  fireEvent.click(screen.getByRole('button', { name: /^27 Oct 2026/ }));
  expect(screen.getByText('No earnings from completed shifts on this date.')).toBeTruthy();
  expect(container.querySelector('.pay-receipt.is-calendar')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Save as PDF' }));
  expect(print).toHaveBeenCalledOnce();
});

it('copies a complete payslip when native sharing is unavailable', async () => {
  mockFetch({ '/api/pay/me': payslip });
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  render(<Pay me={worker} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Share payslip' }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Ravi Kumar')));
  expect(writeText.mock.calls[0]?.[0]).toContain('₹14,576.25');
  expect(await screen.findByText('Payslip copied. You can paste it into a message.')).toBeTruthy();
});

it.each(['hi', 'ta'] as const)('renders and reads the daily breakdown in %s', async (lang) => {
  setLang(lang);
  mockFetch({ '/api/pay/me': payslip, '/api/pay/calendar': calendar });
  render(<Pay me={worker} />);
  fireEvent.click(await screen.findByRole('button', { name: t('calendar.title') }));
  expect(await screen.findByText(t('calendar.base'))).toBeTruthy();
  const buttons = screen.getAllByRole('button');
  const audio = buttons.find((button) => button.getAttribute('aria-label')?.startsWith(`${t('common.readAloud')}: ${formatDay(day.day)}`));
  expect(audio).toBeTruthy();
  fireEvent.click(audio!);
  expect(speak).toHaveBeenCalledWith(expect.stringContaining(t('calendar.estimateHelp')), lang);
});

it('marks and removes a site-wide schedule notice through the admin form', async () => {
  let records: unknown[] = [];
  const fetchMock = mockFetch({ '/api/admin/days-off': () => ({ status: 200, body: records }) });
  fetchMock.mockImplementation(async (_url, init) => {
    if (init?.method === 'POST') {
      const body = JSON.parse(typeof init.body === 'string' ? init.body : '{}') as { active: boolean };
      records = body.active ? [body] : [];
    }
    return new Response(JSON.stringify(records), { status: 200 });
  });
  render(<DaysOff />);
  fireEvent.input(screen.getByLabelText('Date'), { target: { value: '2026-10-31' } });
  fireEvent.input(screen.getByLabelText('Reason or label'), { target: { value: 'Maintenance' } });
  fireEvent.click(screen.getByRole('button', { name: 'Mark day off' }));
  expect(await screen.findByText('Maintenance')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Remove: 31 Oct 2026/ }));
  expect(await screen.findByText('No days off have been marked.')).toBeTruthy();
  expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST' && typeof init.body === 'string' && init.body.includes('"active":false'))).toBe(true);
});
