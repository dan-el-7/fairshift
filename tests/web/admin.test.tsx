// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminOverview, Me, ReportAdmin } from '../../src/shared/api';
import { App } from '../../src/web/app';
import { setLang } from '../../src/web/i18n';
import { resetSessionForTests } from '../../src/web/session';
import { json, mockFetch, worker } from './helpers';

const admin: Me = { ...worker, id: 'admin-skyline', name: 'Meera Admin', role: 'admin', jobTitle: 'Site manager' };

const overview: AdminOverview = {
  site: worker.site,
  kpis: {
    workers: 6,
    presentToday: 4,
    overtimeHours14d: 37.5,
    openReports: 3,
    overdueReports: 1,
    fatigueAlerts: 2,
    highRiskWorkers: 1,
  },
  attendance14d: Array.from({ length: 14 }, (_, i) => ({
    day: `2026-10-${String(14 + i).padStart(2, '0')}`,
    present: (i % 5) + 2,
    overtimeHours: i % 3,
  })),
  reportsBySeverity: { low: 1, medium: 2, high: 1, critical: 0 },
  reportsByStatus: { open: 3, acknowledged: 0, in_progress: 0, resolved: 1 },
  atRisk: [
    {
      id: 'worker-kavya',
      name: 'Kavya Devi',
      jobTitle: 'Electrician',
      language: 'ta',
      hours14d: 120,
      overtime14d: 26,
      fatigue: [{ rule: 'long_shift', severity: 'high', detail: { hours: 13 }, at: '2026-10-27T10:00:00Z' }],
      quitRisk: {
        score: 72,
        level: 'high',
        factors: [
          { factor: 'high_overtime', points: 25 },
          { factor: 'fatigue', points: 10 },
        ],
      },
    },
  ],
};

const reports: ReportAdmin[] = [
  {
    id: 'r-calm',
    caseCode: 'AAAA-2222',
    siteId: 'site-skyline',
    category: 'other',
    severity: 'low',
    language: 'en',
    text: 'Tea stall needs a clean cup area.',
    textEn: 'Tea stall needs a clean cup area.',
    status: 'open',
    createdDay: '2026-10-25',
    updates: [],
    overdue: false,
  },
  {
    id: 'r1',
    caseCode: 'ABCD-EFGH',
    siteId: 'site-skyline',
    category: 'electrical',
    severity: 'critical',
    language: 'ta',
    text: 'மின் கம்பி தொங்குகிறது',
    textEn: 'Exposed wire hanging near the lift shaft',
    status: 'open',
    createdDay: '2026-10-20',
    updates: [],
    overdue: true,
  },
];

/** Routes by method and path, so one URL can answer GET and PATCH differently. */
type Handler = (method: string, body: unknown) => { status?: number; body: unknown };

function stubApi(handlers: Record<string, Handler>) {
  const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0] ?? '';
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    const key = Object.keys(handlers).find((prefix) => path === prefix || path.startsWith(`${prefix}/`));
    const handler = key === undefined ? undefined : handlers[key];
    if (!handler) return json(404, { error: 'not found' });
    const answer = handler(method, body);
    return json(answer.status ?? 200, answer.body);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

async function violations(container: Element) {
  const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`);
}

beforeEach(() => {
  resetSessionForTests();
  // Deterministic start: English, onboarding and role intros already done, so no overlay covers the page.
  setLang('en');
  localStorage.setItem('fairshift.onboarded', '1');
  localStorage.setItem('fairshift.intro.admin', '1');
  localStorage.setItem('fairshift.intro.worker', '1');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setLang('en');
  window.location.hash = '';
});

describe('admin dashboard', () => {
  it('renders KPIs and the at-risk table from the overview', async () => {
    mockFetch({ '/api/me': admin, '/api/admin/overview': overview });
    window.location.hash = '#/a';

    render(<App />);

    const presentLabel = await screen.findByText('Present today', undefined, { timeout: 5000 });
    expect(presentLabel.parentElement?.querySelector('.kpi-value')?.textContent).toBe('4');
    expect(screen.getByText('Overtime hours (14 days)').parentElement?.querySelector('.kpi-value')?.textContent).toBe('37.5');
    expect(screen.getByText('Overdue reports').parentElement?.querySelector('.kpi-value')?.textContent).toBe('1');

    const table = screen.getByRole('table', { name: 'At-risk workers' });
    expect(within(table).getByText('Kavya Devi')).toBeTruthy();
    expect(within(table).getByText('Electrician')).toBeTruthy();
    expect(within(table).getByText('High')).toBeTruthy();
    expect(within(table).getByText('High overtime')).toBeTruthy();
    expect(within(table).getByText('+25')).toBeTruthy();
    expect(within(table).getByText('Long shift')).toBeTruthy();

    expect(screen.getByText('Risk uses attendance and hours only — never anonymous reports or feedback.')).toBeTruthy();
  });

  it('offers a read-aloud button next to the heading that speaks the KPI summary', async () => {
    mockFetch({ '/api/me': admin, '/api/admin/overview': overview });
    window.location.hash = '#/a';

    render(<App />);

    const button = await screen.findByRole('button', { name: /^Read aloud: 4 of 6 workers present today/ }, { timeout: 5000 });
    expect(button.getAttribute('aria-label')).toContain('3 open reports');
    expect(button.getAttribute('aria-label')).toContain('1 overdue');
    expect(button.getAttribute('aria-label')).toContain('2 fatigue alerts');
    expect(button.closest('.heading-row')?.querySelector('h1')?.textContent).toBe('Dashboard');
  });

  it('draws the attendance chart with an accessible label and a hidden data table', async () => {
    mockFetch({ '/api/me': admin, '/api/admin/overview': overview });
    window.location.hash = '#/a';

    render(<App />);

    const chart = await screen.findByRole('img', { name: 'Workers present each day over the last 14 days' }, { timeout: 5000 });
    expect(chart.querySelectorAll('rect.chart-bar').length).toBe(14);
    const dataTable = screen.getByRole('table', { name: 'Attendance and overtime for the last 14 days' });
    expect(within(dataTable).getAllByRole('row').length).toBe(15);
  });
});

describe('admin reports', () => {
  it('lists overdue reports first and PATCHes a status change in place', async () => {
    const patchBodies: unknown[] = [];
    const fetchMock = stubApi({
      '/api/me': () => ({ body: admin }),
      '/api/admin/reports': (method, body) => {
        if (method === 'PATCH') {
          patchBodies.push(body);
          return {
            body: { ...reports[1], status: 'resolved', updates: [{ status: 'resolved', note: 'Wire fixed', day: '2026-10-27' }], overdue: true },
          };
        }
        return { body: reports };
      },
    });
    window.location.hash = '#/a/reports?filter=all';

    render(<App />);

    const text = await screen.findByText('Exposed wire hanging near the lift shaft', undefined, { timeout: 5000 });
    const item = text.closest('li');
    expect(item).toBeTruthy();
    const first = document.querySelector('.entries li');
    expect(first?.contains(text)).toBe(true);

    const original = within(item as HTMLElement).getByText('மின் கம்பி தொங்குகிறது');
    expect(original.getAttribute('lang')).toBe('ta');

    const scope = within(item as HTMLElement);
    fireEvent.click(scope.getByText('Update report'));
    fireEvent.change(scope.getByLabelText('New status'), { target: { value: 'resolved' } });
    fireEvent.input(scope.getByLabelText('Note (optional)'), { target: { value: 'Wire fixed' } });
    const form = item?.querySelector('form');
    expect(form).toBeTruthy();
    fireEvent.submit(form!);

    await waitFor(() => expect(item?.querySelector('.badge-status')?.textContent).toBe('Resolved'));
    expect(patchBodies).toEqual([{ status: 'resolved', note: 'Wire fixed', expectedVersion: 0 }]);
    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(patchCall?.[0]).toBe('/api/admin/reports/r1');
    expect(screen.getByText('Report updated.')).toBeTruthy();
  });

  it('renders one item per report, each with a read-aloud button', async () => {
    stubApi({
      '/api/me': () => ({ body: admin }),
      '/api/admin/reports': () => ({ body: reports }),
    });
    window.location.hash = '#/a/reports';

    render(<App />);

    await screen.findByText('Exposed wire hanging near the lift shaft', undefined, { timeout: 5000 });
    const items = document.querySelectorAll('.entries > li');
    expect(items.length).toBe(reports.length);
    for (const item of items) {
      expect(within(item as HTMLElement).getByRole('button', { name: /^Read aloud: / })).toBeTruthy();
    }
    const critical = items[0] as HTMLElement;
    expect(within(critical).getByRole('button', { name: /Exposed wire hanging near the lift shaft/ })).toBeTruthy();
  });
});

describe('admin feedback', () => {
  it('shows the anonymity message when there are too few responses', async () => {
    mockFetch({ '/api/me': admin, '/api/admin/feedback': { insufficient: true, count: 3 } });
    window.location.hash = '#/a/feedback';

    render(<App />);

    expect(
      await screen.findByText(
        'At least 5 responses are needed before results are shown, to protect anonymity (currently 3).',
        undefined,
        { timeout: 5000 },
      ),
    ).toBeTruthy();
  });
});

describe('admin accessibility (axe-core, colour contrast excluded)', () => {
  it('dashboard has no violations', async () => {
    mockFetch({ '/api/me': admin, '/api/admin/overview': overview });
    window.location.hash = '#/a';
    const { container } = render(<App />);
    await screen.findByText('Kavya Devi', undefined, { timeout: 5000 });
    expect(await violations(container)).toEqual([]);
  });

  it('reports page has no violations', async () => {
    stubApi({
      '/api/me': () => ({ body: admin }),
      '/api/admin/reports': () => ({ body: reports }),
    });
    window.location.hash = '#/a/reports';
    const { container } = render(<App />);
    await screen.findByText('Exposed wire hanging near the lift shaft', undefined, { timeout: 5000 });
    expect(await violations(container)).toEqual([]);
  });
});
