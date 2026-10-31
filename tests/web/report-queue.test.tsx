// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReportAdmin } from '../../src/shared/api';
import type { ReportStatus } from '../../src/shared/types';
import { setLang } from '../../src/web/i18n';
import Reports from '../../src/web/pages/admin/Reports';
import { navigate } from '../../src/web/router';
import { json } from './helpers';

function report(id: string, changes: Partial<ReportAdmin> = {}): ReportAdmin {
  return {
    id, caseCode: 'AAAA-2222', siteId: 'site-skyline', category: 'other', severity: 'low',
    language: 'en', text: changes.textEn ?? 'Clean drinking water', textEn: 'Clean drinking water', status: 'open',
    createdDay: '2026-10-25', updates: [], overdue: false, ...changes,
  };
}

const first = report('first');
const overdue = report('overdue', { caseCode: 'BBBB-3333', severity: 'high', overdue: true, textEn: 'Exposed wire' });
const resolved = report('resolved', { caseCode: 'CCCC-4444', severity: 'critical', status: 'resolved', textEn: 'Fire door repaired' });
const initial = [first, overdue, resolved];

function installApi(read: () => ReportAdmin[]) {
  return vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (init?.method === 'PATCH') {
      const body = JSON.parse(init.body as string) as { status: ReportStatus; note?: string };
      const previous = read().find((item) => url.endsWith(`/${item.id}`));
      if (!previous) return json(404, { error: 'not found' });
      const update = { ...body, day: '2026-10-29' };
      return json(200, { ...previous, status: body.status, overdue: false, updates: [...previous.updates, update] });
    }
    return json(200, read());
  }));
}

async function go(to: string) {
  await act(() => {
    navigate(to);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

beforeEach(() => {
  setLang('en');
  window.location.hash = '#/a/reports';
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.location.hash = '';
});

describe('report queue', () => {
  it('starts with unresolved cases in overdue-first order and keeps editors collapsed', async () => {
    installApi(() => initial);
    render(<Reports />);
    await screen.findByText('Exposed wire');
    expect(document.querySelector('.entries > li')?.id).toBe('report-overdue');
    expect(screen.queryByText('Fire door repaired')).toBeNull();
    expect(document.querySelectorAll('.report-editor').length).toBe(2);
    expect(document.querySelectorAll('.report-editor[open]').length).toBe(0);
  });

  it('honours dashboard severity links and query-only changes, and searches unhyphenated case codes', async () => {
    installApi(() => initial);
    window.location.hash = '#/a/reports?filter=all&severity=critical';
    render(<Reports />);
    await screen.findByText('Fire door repaired');
    expect(screen.queryByText('Exposed wire')).toBeNull();

    await go('/a/reports?filter=overdue&severity=high');
    expect(screen.getByText('Exposed wire')).toBeTruthy();
    expect(screen.queryByText('Fire door repaired')).toBeNull();
    expect(screen.getByLabelText<HTMLSelectElement>('Priority').value).toBe('high');

    await go('/a/reports?filter=resolved');
    fireEvent.input(screen.getByLabelText('Search by case code'), { target: { value: 'cccc4444' } });
    expect(screen.getByText('Fire door repaired')).toBeTruthy();
    fireEvent.input(screen.getByLabelText('Search by case code'), { target: { value: 'missing' } });
    expect(screen.getByText('No reports match these filters.')).toBeTruthy();
    expect(screen.queryByText('Fire door repaired')).toBeNull();
  });

  it('switches queue filters through visible controls and removes a saved resolved case from the unresolved queue', async () => {
    installApi(() => initial);
    render(<Reports />);
    await screen.findByText('Exposed wire');
    fireEvent.click(screen.getByRole('button', { name: 'Resolved' }));
    await screen.findByText('Fire door repaired');
    fireEvent.click(screen.getByRole('button', { name: 'Unresolved' }));
    const description = await screen.findByText('Exposed wire');
    const item = description.closest('li')!;
    fireEvent.click(within(item).getByText('Update report', { exact: true }));
    fireEvent.change(within(item).getByLabelText('New status'), { target: { value: 'resolved' } });
    fireEvent.input(within(item).getByLabelText('Note (optional)'), { target: { value: 'Wire repaired' } });
    fireEvent.submit(item.querySelector('form')!);
    await screen.findByText('Report updated.');
    expect(screen.queryByText('Exposed wire')).toBeNull();
    expect(screen.getByText('Clean drinking water')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Resolved' }));
    expect(await screen.findByText('Exposed wire')).toBeTruthy();
  });

  it('preserves drafts during live refresh and lets newer server history replace a local saved response', async () => {
    vi.useFakeTimers();
    let remote = [first];
    installApi(() => remote);
    window.location.hash = '#/a/reports?filter=all';
    render(<Reports />);
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    const item = screen.getByText('Clean drinking water').closest('li')!;
    fireEvent.click(within(item).getByText('Update report', { exact: true }));
    fireEvent.change(within(item).getByLabelText('New status'), { target: { value: 'in_progress' } });
    fireEvent.input(within(item).getByLabelText('Note (optional)'), { target: { value: 'Draft note' } });

    remote = [{ ...first, status: 'acknowledged', updates: [{ status: 'acknowledged', day: '2026-10-29' }] }];
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(item.querySelector('.badge-status')?.textContent).toBe('Seen by the team');
    expect(within(item).getByLabelText<HTMLSelectElement>('New status').value).toBe('in_progress');
    expect(within(item).getByLabelText<HTMLTextAreaElement>('Note (optional)').value).toBe('Draft note');

    fireEvent.submit(item.querySelector('form')!);
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(item.querySelector('.badge-status')?.textContent).toBe('Work in progress');
    remote = [{ ...resolved, id: first.id, caseCode: first.caseCode, textEn: first.textEn,
      updates: [
        { status: 'acknowledged', day: '2026-10-29' },
        { status: 'in_progress', day: '2026-10-29' },
        { status: 'resolved', day: '2026-10-29' },
      ] }];
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(item.querySelector('.badge-status')?.textContent).toBe('Resolved');
    expect(within(item).getByLabelText<HTMLSelectElement>('New status').value).toBe('resolved');
    expect(within(item).getByLabelText<HTMLTextAreaElement>('Note (optional)').value).toBe('');
  });
});
