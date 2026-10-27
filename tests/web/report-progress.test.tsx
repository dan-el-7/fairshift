// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Report from '../../src/web/pages/worker/Report';
import { setLang } from '../../src/web/i18n';
import { worker } from './helpers';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('report sending progress', () => {
  it('shows advancing progress while the server sorts a slow report', async () => {
    vi.useFakeTimers();
    setLang('en');
    // The server is slow (AI triage): the request never resolves during this test.
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => undefined)));
    render(<Report me={worker} />);

    fireEvent.input(screen.getByLabelText('Describe the problem'), { target: { value: 'Loose wiring near the lift' } });
    fireEvent.submit(screen.getByRole('button', { name: /send report/i }).closest('form')!);

    const progress = () => document.querySelector('.send-progress');
    expect(progress()?.getAttribute('role')).toBe('status');
    expect(progress()?.textContent).toContain('Sending your report');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_500);
    });
    expect(progress()?.textContent).toContain('sorting it by urgency');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(7_000);
    });
    expect(progress()?.textContent).toContain('Please keep this page open');
  });
});
