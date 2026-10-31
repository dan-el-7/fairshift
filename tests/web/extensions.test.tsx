// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Payslip } from '../../src/shared/types';
import CorrectionForm from '../../src/web/pages/worker/CorrectionForm';
import Corrections from '../../src/web/pages/admin/Corrections';
import PayComparison, { comparisonRows, previousPeriod } from '../../src/web/pages/worker/PayComparison';
import UpcomingDaysOff from '../../src/web/pages/worker/UpcomingDaysOff';
import { setLang, t } from '../../src/web/i18n';
import { json, mockFetch, payslip } from './helpers';

beforeEach(() => setLang('en'));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); setLang('en'); });

it('submits a named correction for the selected date and shows its pending history', async () => {
  let requests: unknown[] = [];
  const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      const record = { ...body, id: 'request-1', status: 'pending', createdAt: '2026-10-31T00:00:00Z', basedOn: 'original' };
      requests = [record]; return json(201, record);
    }
    return json(200, { requests, shifts: [] });
  });
  vi.stubGlobal('fetch', fetch);
  const { container } = render(<CorrectionForm day="2026-10-20" />);
  const details = container.querySelector('details')!;
  details.open = true; fireEvent(details, new Event('toggle'));
  fireEvent.change(await screen.findByLabelText('What needs correcting?'), { target: { value: 'pay' } });
  fireEvent.input(screen.getByLabelText('Amount to add or subtract (₹)'), { target: { value: '125.50' } });
  fireEvent.input(screen.getByLabelText('Reason (at least 5 characters)'), { target: { value: 'Missing site allowance' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send for review' }));
  expect(await screen.findByText('Request sent. Your admin will review it.')).toBeTruthy();
  expect(await screen.findByText('Pending')).toBeTruthy();
  const call = fetch.mock.calls.find(([, init]) => init?.method === 'POST');
  expect(JSON.parse(call?.[1]?.body as string)).toMatchObject({ kind: 'pay', day: '2026-10-20', amount: 12550 });
  expect(screen.getByText(/Your name and request go to your site admin/)).toBeTruthy();
});

it('prefills the recorded shift in India time and sends corrected times as UTC', async () => {
  const shift = { id: 's1', checkIn: '2026-10-20T03:30:00Z', checkOut: '2026-10-20T11:30:00Z', workerId: 'w', siteId: 's', method: 'qr' };
  const fetch = vi.fn(async (_url: string, init?: RequestInit) => json(200, init?.method === 'POST' ? {} : { requests: [], shifts: [shift] }));
  vi.stubGlobal('fetch', fetch);
  const { container } = render(<CorrectionForm day="2026-10-20" />);
  const details = container.querySelector('details')!; details.open = true; fireEvent(details, new Event('toggle'));
  fireEvent.change(await screen.findByLabelText('Recorded shift'), { target: { value: 's1' } });
  expect(screen.getByLabelText<HTMLInputElement>('Correct check-in').value).toBe('2026-10-20T09:00');
  fireEvent.input(screen.getByLabelText('Correct check-out'), { target: { value: '2026-10-20T19:00' } });
  fireEvent.input(screen.getByLabelText('Reason (at least 5 characters)'), { target: { value: 'Two hours overtime missing' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send for review' }));
  await waitFor(() => expect(fetch.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true));
  expect(JSON.parse(fetch.mock.calls.find(([, init]) => init?.method === 'POST')?.[1]?.body as string)).toMatchObject({ shiftId: 's1', checkOut: '2026-10-20T13:30:00.000Z' });
});

it('requires a review reason and shows the reviewed result after admin approval', async () => {
  let record = { id: 'r1', day: '2026-10-20', kind: 'pay', amount: 12500, reason: 'Missing allowance', status: 'pending', workerName: 'Ravi Kumar', workerId: 'w', createdAt: '2026-10-20T00:00:00Z' };
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') record = { ...record, status: 'approved' };
    return json(200, init?.method === 'POST' ? record : [record]);
  }));
  const reviewed = vi.fn();
  render(<Corrections onReviewed={reviewed} />);
  await screen.findByText('Ravi Kumar');
  fireEvent.input(screen.getByLabelText('Review reason (visible to worker)'), { target: { value: 'Verified site register' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save review' }));
  await waitFor(() => expect(reviewed).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole('button', { name: 'History' }));
  expect(await screen.findByText('Approved')).toBeTruthy();
});

it('explains a partial-month comparison and reconciles all changes including net adjustments', async () => {
  const previous: Payslip = { ...payslip, period: { ...payslip.period, id: '2026-09' }, net: payslip.net - 10000, deductions: payslip.deductions + 10000 };
  const current: Payslip = { ...payslip, adjustments: [{ day: '2026-10-20', amount: 12345, reason: 'Approved allowance' }], net: payslip.net + 12345 };
  expect(previousPeriod('2026-01')).toBe('2025-12');
  expect(comparisonRows(current, previous).reduce((sum, [, value]) => sum + value, 0)).toBe(current.net - previous.net);
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-31T00:00:00Z'));
  mockFetch({ '/api/pay/me': previous }); render(<PayComparison slip={current} />);
  expect(await screen.findByText(/Current month so far versus the full previous month/)).toBeTruthy();
  expect(screen.getAllByText('+₹223.45').length).toBeGreaterThan(0);
  vi.useRealTimers();
});

it.each(['en', 'hi', 'ta'] as const)('renders upcoming site notices and their audio in %s', async (lang) => {
  setLang(lang);
  mockFetch({ '/api/schedule/me': { today: '2026-10-31', days: [{ siteId: 's', day: '2026-11-01', active: true, label: 'Planned maintenance' }] } });
  render(<UpcomingDaysOff />);
  expect(await screen.findByText('Planned maintenance')).toBeTruthy();
  expect(screen.getByRole('heading', { name: t('home.daysOff.title') })).toBeTruthy();
  expect(screen.getByRole('button', { name: new RegExp(t('common.readAloud')) })).toBeTruthy();
  expect(screen.getByRole('link', { name: t('home.daysOff.calendar') }).getAttribute('href')).toBe('#/w/pay?view=calendar');
});
