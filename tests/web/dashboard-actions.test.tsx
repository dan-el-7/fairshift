// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminOverview, WorkerSummary } from '../../src/shared/api';
import Dashboard from '../../src/web/pages/admin/Dashboard';
import Workers from '../../src/web/pages/admin/Workers';
import { setLang, t } from '../../src/web/i18n';
import { mockFetch, worker } from './helpers';

const people: WorkerSummary[] = [
  {
    id: 'high', name: 'Anita', jobTitle: 'Electrician', language: 'en', hours14d: 100, overtime14d: 25,
    fatigue: [{ rule: 'long_shift', severity: 'high', detail: { hours: 13 }, at: '2026-10-29T10:00:00Z' }],
    quitRisk: { score: 70, level: 'high', factors: [] },
  },
  {
    id: 'medium', name: 'Bala', jobTitle: 'Mason', language: 'en', hours14d: 90, overtime14d: 15,
    fatigue: [{ rule: 'weekly_overload', severity: 'medium', detail: { hours: 65 }, at: '2026-10-29T10:00:00Z' }],
    quitRisk: { score: 40, level: 'medium', factors: [] },
  },
  {
    id: 'low', name: 'Chitra', jobTitle: 'Helper', language: 'en', hours14d: 70, overtime14d: 0,
    fatigue: [], quitRisk: { score: 5, level: 'low', factors: [] },
  },
];

const overview: AdminOverview = {
  site: worker.site,
  kpis: { workers: 3, presentToday: 2, overtimeHours14d: 40, openReports: 2, overdueReports: 1, fatigueAlerts: 2, highRiskWorkers: 1 },
  attendance14d: [{ day: '2026-10-29', present: 2, overtimeHours: 1 }],
  reportsBySeverity: { critical: 1, high: 0, medium: 1, low: 1 },
  reportsByStatus: { open: 2, acknowledged: 0, in_progress: 0, resolved: 1 },
  atRisk: people.slice(0, 2),
};

beforeEach(() => { setLang('en'); });
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.location.hash = '';
});

describe('admin action links', () => {
  it('links attention counts to actionable filters and labels severity counts as all reports', async () => {
    mockFetch({ '/api/admin/overview': overview });
    render(<Dashboard />);

    const overdue = await screen.findByRole('link', { name: /Overdue reports/ });
    expect(overdue.getAttribute('href')).toBe('#/a/reports?filter=overdue');
    expect(screen.getByRole('link', { name: /Open reports/ }).getAttribute('href')).toBe('#/a/reports?filter=unresolved');
    expect(screen.getByRole('link', { name: /Fatigue alerts/ }).getAttribute('href')).toBe('#/a/workers?filter=fatigue');
    expect(screen.getByRole('link', { name: /High-risk workers/ }).getAttribute('href')).toBe('#/a/workers?filter=high-risk');
    expect(screen.getByRole('heading', { name: t('admin.severity.all') })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Critical/ }).getAttribute('href')).toBe('#/a/reports?filter=all&severity=critical');
  });

  it('applies worker deep-link filters and updates the visible list when the filter changes', async () => {
    mockFetch({ '/api/admin/workers': people });
    window.location.hash = '#/a/workers?filter=fatigue';
    render(<Workers />);

    await screen.findByRole('rowheader', { name: 'Anita' });
    expect(screen.getByRole('rowheader', { name: 'Bala' })).toBeTruthy();
    expect(screen.queryByRole('rowheader', { name: 'Chitra' })).toBeNull();
    const select = screen.getByRole('combobox', { name: t('admin.workers.filter') });
    fireEvent.change(select, { target: { value: 'high-risk' } });
    await waitFor(() => expect(screen.queryByRole('rowheader', { name: 'Bala' })).toBeNull());
    expect(screen.getByRole('rowheader', { name: 'Anita' })).toBeTruthy();

    fireEvent.change(select, { target: { value: 'all' } });
    await screen.findByRole('rowheader', { name: 'Chitra' });
    const training = screen.getByText('Add skill / training for Chitra');
    expect(training.closest('summary')?.querySelector('svg')).toBeTruthy();
  });

  it('shows a useful empty state when a worker filter has no matches', async () => {
    mockFetch({ '/api/admin/workers': [people[2]] });
    window.location.hash = '#/a/workers?filter=high-risk';
    render(<Workers />);
    expect(await screen.findByText(t('admin.workers.noMatches'))).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });
});
