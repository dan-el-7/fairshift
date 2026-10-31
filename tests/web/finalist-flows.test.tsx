// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/web/app';
import { setLang, tIn } from '../../src/web/i18n';
import { COPY } from '../../src/web/components/onboarding/content';
import { ensureSession, resetSessionForTests, setSession } from '../../src/web/session';
import Attendance from '../../src/web/pages/worker/Attendance';
import { completedHoursToday } from '../../src/web/pages/worker/Home';
import Qr from '../../src/web/pages/admin/Qr';
import { emptyAttendance, json, mockFetch, personas, payslip, reply, worker } from './helpers';
import type { Language, Role, ShiftWithSummary } from '../../src/shared/types';

beforeEach(() => {
  resetSessionForTests();
  setLang('en');
  localStorage.clear();
  window.location.hash = '#/';
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  setLang('en');
  window.location.hash = '';
});

describe('public deep links', () => {
  it.each(['#/verify?token=demo', '#/track'])('never covers %s with welcome or role onboarding', async (hash) => {
    mockFetch({ '/api/me': worker, '/api/passport/verify': { valid: false } });
    window.location.hash = hash;
    render(<App />);
    await ensureSession();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/Verify a passport|Track a report/);
    expect(localStorage.getItem('fairshift.onboarded')).toBeNull();
  });
});

describe('demo onboarding after selecting a language', () => {
  const cases = (['en', 'hi', 'ta'] as Language[]).flatMap((lang) =>
    (['worker', 'admin'] as Role[]).map((role) => ({ lang, role })),
  );
  it.each(cases)('keeps the $lang $role intro when an older session check returns late', async ({ lang, role }) => {
    localStorage.setItem('fairshift.onboarded', '1');
    localStorage.setItem(`fairshift.intro.${role}`, '1');
    let finishMe!: (value: Response) => void;
    const lateMe = new Promise<Response>((resolve) => { finishMe = resolve; });
    const account = { ...worker, role };
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url === '/api/me') return lateMe;
      if (url === '/api/auth/personas') return Promise.resolve(json(200, personas));
      if (url === '/api/auth/demo') return Promise.resolve(json(200, account));
      if (url.startsWith('/api/attendance/me')) return Promise.resolve(json(200, emptyAttendance));
      if (url.startsWith('/api/schedule/me')) return Promise.resolve(json(200, { today: '2026-10-31', days: [] }));
      if (url.startsWith('/api/pay/me')) return Promise.resolve(json(200, payslip));
      if (url === '/api/admin/overview') return Promise.resolve(json(200, {
        site: worker.site,
        kpis: { workers: 0, presentToday: 0, overtimeHours14d: 0, openReports: 0, overdueReports: 0, fatigueAlerts: 0, highRiskWorkers: 0 },
        attendance14d: [], reportsBySeverity: { low: 0, medium: 0, high: 0, critical: 0 }, atRisk: [],
      }));
      return Promise.resolve(json(200, []));
    }));
    render(<App />);
    const labels = { en: 'English', hi: 'हिन्दी', ta: 'தமிழ்' };
    fireEvent.click(await screen.findByRole('button', { name: labels[lang] }));
    fireEvent.click(await screen.findByText('Ravi Kumar'));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.querySelector('.ob-greet-item.is-in')?.getAttribute('lang')).toBe(lang);
    await act(async () => { finishMe(json(401, { error: 'no session' })); await lateMe; });
    expect(screen.getByRole('dialog')).toBe(dialog);
    fireEvent.click(within(dialog).getByRole('button', { name: /^Hello · नमस्ते/ }));
    fireEvent.click(await within(dialog).findByRole('radio', { name: new RegExp(`^${labels[lang]}`) }));
    fireEvent.click(within(dialog).getByRole('button', { name: tIn(lang, 'language.continue') }));
    const title = COPY[lang].roles[role][0].title;
    await screen.findByRole('heading', { name: title });
    expect(screen.getByRole('heading', { name: title })).toBeTruthy();
    expect(await ensureSession()).toEqual(account);
    expect(document.documentElement.lang).toBe(lang);
  });

  it('does not restore a stale signed-in session after logout', async () => {
    let finish!: (value: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; })));
    const pending = ensureSession();
    setSession(null);
    finish(json(200, worker));
    expect(await pending).toBeNull();
    expect(await ensureSession()).toBeNull();
  });

  it('replays a translated intro when the same persona is selected again without logging out', async () => {
    localStorage.setItem('fairshift.onboarded', '1');
    mockFetch({ '/api/me': reply(401, {}), '/api/auth/personas': personas,
      '/api/auth/demo': worker, '/api/attendance/me': emptyAttendance, '/api/pay/me': payslip });
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'தமிழ்' }));
    fireEvent.click(await screen.findByText('Ravi Kumar'));
    await screen.findByRole('dialog');
    expect(document.querySelector('.ob-greet-item.is-in')?.getAttribute('lang')).toBe('ta');
    fireEvent.click(screen.getByRole('button', { name: COPY.ta.skip }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(screen.getByRole('link', { name: 'FairShift' }));
    fireEvent.click(await screen.findByRole('button', { name: 'हिन्दी' }));
    fireEvent.click(await screen.findByText('Ravi Kumar'));
    await screen.findByRole('dialog');
    await waitFor(() => expect(document.querySelector('.ob-greet-item.is-in')?.getAttribute('lang')).toBe('hi'));
  });
});

describe('attendance fallback', () => {
  it('shows the manual field immediately when scanning is unavailable and submits the signed token unchanged', async () => {
    vi.stubGlobal('BarcodeDetector', undefined);
    const fetchMock = mockFetch({ '/api/attendance/me': emptyAttendance, '/api/attendance/check-in': {} });
    render(<Attendance me={worker} />);
    const input = screen.getByRole('textbox', { name: 'Type the code from the gate' });
    fireEvent.input(input, { target: { value: 'site-skyline.123456.0123456789abcdef' } });
    fireEvent.submit(input.closest('form')!);
    await screen.findByText('You are checked in.');
    const request = fetchMock.mock.calls.find(([url]) => url === '/api/attendance/check-in');
    expect(JSON.parse(request?.[1]?.body as string)).toEqual({ qrToken: 'site-skyline.123456.0123456789abcdef' });
  });

  it('exposes the same signed token at the kiosk for manual copying', async () => {
    const token = 'site-skyline.123456.0123456789abcdef';
    mockFetch({ '/api/admin/qr': { token, expiresInSec: 60 } });
    render(<Qr />);
    const input = await screen.findByRole('textbox', { name: 'Type the code from the gate' });
    expect(input).toHaveProperty('value', token);
    expect(input).toHaveProperty('readOnly', true);
  });
});

describe('home completed-hours summary', () => {
  it('clips overnight completed work to today in IST and excludes an open shift', () => {
    const makeShift = (start: string, end: string | null): ShiftWithSummary => ({
      id: start, workerId: worker.id, siteId: worker.site.id, method: 'qr', checkIn: start, checkOut: end,
      summary: { hours: 0, regularHours: 0, overtimeHours: 0, nightHours: 0 },
    });
    const now = new Date('2026-10-29T12:00:00+05:30');
    expect(completedHoursToday([
      makeShift('2026-10-28T23:00:00+05:30', '2026-10-29T02:00:00+05:30'),
      makeShift('2026-10-29T08:00:00+05:30', '2026-10-29T10:30:00+05:30'),
      makeShift('2026-10-29T11:00:00+05:30', null),
    ], now)).toBe(4.5);
  });
});
