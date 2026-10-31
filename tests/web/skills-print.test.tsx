// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Me, PassportMe } from '../../src/shared/api';

const qr = vi.hoisted(() => ({ toDataURL: vi.fn() }));
vi.mock('qrcode', () => ({ default: qr }));
vi.mock('../../src/web/useApiData', () => ({
  useApiData: () => ({ loading: false, error: null, reload: vi.fn(), data: passport }),
}));
vi.mock('../../src/web/i18n', () => ({
  formatDay: () => '2026-10-31',
  t: (key: string) => ({ 'skills.print': 'Print / Save PDF', 'skills.verifyLink': 'Verify this passport', 'skills.qrUnavailable': 'QR unavailable. The verification link still works.' }[key] ?? key),
}));
vi.mock('../../src/web/clipboard', () => ({ copyText: vi.fn() }));
vi.mock('../../src/web/components/SpeakButton', () => ({ SpeakButton: () => null }));

const me: Me = { id: 'worker-1', name: 'Ravi Kumar', role: 'worker', jobTitle: 'Electrician', site: { id: 'site-1', name: 'Site', industry: 'construction', lat: 0, lng: 0, radiusM: 100 }, language: 'en' };
const passport: PassportMe = {
  shareToken: 'abc-123',
  entries: [{ id: 'entry-1', workerId: 'worker-1', industry: 'construction', title: 'Welding', kind: 'training', hours: 8, issuer: 'Training Center', issuedOn: '2026-10-01' }],
};

describe('skills passport printing', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('prints name, entries and verification link', async () => {
    qr.toDataURL.mockResolvedValue('data:image/png;base64,qr');
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    render(<Skills me={me} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Print / Save PDF' }));
    expect(print).toHaveBeenCalledOnce();
    expect(document.querySelector('.skills-passport')?.textContent).toContain('Ravi Kumar');
    expect(document.querySelector('.skills-passport')?.textContent).toContain('Welding');
    expect(document.querySelector('.skills-print-url')?.textContent).toBe(`${window.location.origin}/#/verify?token=abc-123`);
  });

  it('enables printing with the link when QR encoding fails', async () => {
    qr.toDataURL.mockRejectedValue(new Error('encode failed'));
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    render(<Skills me={me} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Print / Save PDF' }));
    expect(print).toHaveBeenCalledOnce();
    expect(await screen.findByText('QR unavailable. The verification link still works.')).toBeTruthy();
    expect(document.querySelector('.skills-print-url')?.textContent).toContain('token=abc-123');
  });
});

import Skills from '../../src/web/pages/worker/Skills';
