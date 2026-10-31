// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Track from '../../src/web/pages/public/Track';
import { currentRoute } from '../../src/web/router';
import { json } from './helpers';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.location.hash = ''; });

describe('report fix confirmation', () => {
  it('keeps response actions hidden until a resolved report is loaded', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, {
      caseCode: 'ABCD-EFGH', category: 'other', severity: 'low', status: 'open', createdDay: '2026-10-29', updates: [], version: 1, confirmationAvailable: true,
    })));
    render(<Track />);
    window.location.hash = '#/track?code=ABCD-EFGH';
    await act(async () => { expect(currentRoute().query.get('code')).toBe('ABCD-EFGH'); fireEvent.input(screen.getByLabelText('Enter your case code'), { target: { value: 'ABCD-EFGH' } }); fireEvent.submit(screen.getByLabelText('Enter your case code').closest('form')!); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(screen.queryByText('The fix is complete')).toBeNull();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Track a report');
  });
});
