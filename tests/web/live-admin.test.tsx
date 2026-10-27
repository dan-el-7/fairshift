// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEMO_REPORTS } from '../../src/shared/demoReports';
import { setLang } from '../../src/web/i18n';
import Report from '../../src/web/pages/worker/Report';
import { useApiData } from '../../src/web/useApiData';
import { mockFetch, worker } from './helpers';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('example report', () => {
  it('fills the description with the example for the worker industry, in the current language', () => {
    setLang('hi');
    render(<Report me={worker} />);
    fireEvent.click(screen.getByRole('button', { name: 'उदाहरण रिपोर्ट भरें' }));
    const box = document.getElementById('report-text') as HTMLTextAreaElement;
    expect(box.value).toBe(DEMO_REPORTS[worker.site.industry].text.hi);
    setLang('en');
  });
});

function Probe() {
  const { data } = useApiData<{ n: number }>('/api/probe', { refreshMs: 10_000 });
  return <p>{data ? `n=${data.n}` : 'loading'}</p>;
}

describe('live refresh', () => {
  it('re-fetches on the interval and shows the new data without a reload', async () => {
    vi.useFakeTimers();
    let n = 0;
    mockFetch({ '/api/probe': () => ({ status: 200, body: { n: ++n } }) });
    render(<Probe />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(screen.getByText('n=1')).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(screen.getByText('n=2')).toBeTruthy();
  });
});
