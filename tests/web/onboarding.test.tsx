// @vitest-environment jsdom
import { render, cleanup, fireEvent, screen, waitFor } from '@testing-library/preact';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Onboarding, hasOnboarded, markOnboarded } from '../../src/web/components/Onboarding';
import * as i18n from '../../src/web/i18n';

vi.mock('../../src/web/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/web/i18n')>();
  return { ...actual, setLang: vi.fn(actual.setLang) };
});

const TAMIL_TITLE_1 = 'நியாயமான ஊதியம், தெளிவான கணக்கு';

/** Runs axe on the container. Only the colour-contrast rule is disabled. */
async function violations(container: Element) {
  const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`);
}

function renderOnboarding() {
  const onDone = vi.fn();
  const view = render(<Onboarding onDone={onDone} />);
  return { onDone, container: view.container };
}

async function goToLanguageStep() {
  fireEvent.click(screen.getByRole('button', { name: /Tap to begin/ }));
  await screen.findByRole('heading', { name: /Choose your language/ });
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(i18n.setLang).mockClear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  // Restore English without saving a choice, since explicit choices persist across tests.
  i18n.setLang('en', { explicit: false });
});

describe('Onboarding', () => {
  it('hello step has one heading with all three greetings', () => {
    renderOnboarding();
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.textContent).toContain('Hello');
    expect(heading.textContent).toContain('नमस्ते');
    expect(heading.textContent).toContain('வணக்கம்');
  });

  it('activating the hello step advances to the language step', async () => {
    renderOnboarding();
    await goToLanguageStep();
    expect(screen.getByRole('button', { name: /^English/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^தமிழ்/ })).toBeTruthy();
  });

  it('choosing Tamil calls setLang with ta and shows the slide in Tamil', async () => {
    renderOnboarding();
    await goToLanguageStep();
    fireEvent.click(screen.getByRole('button', { name: /^தமிழ்/ }));
    expect(i18n.setLang).toHaveBeenCalledWith('ta');
    expect(await screen.findByText(TAMIL_TITLE_1)).toBeTruthy();
  });

  it('Skip calls onDone and records onboarding', async () => {
    const { onDone } = renderOnboarding();
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(localStorage.getItem('fairshift.onboarded')).toBe('1');
    expect(hasOnboarded()).toBe(true);
  });

  it('ArrowRight and ArrowLeft move between slides', async () => {
    renderOnboarding();
    await goToLanguageStep();
    fireEvent.click(screen.getByRole('button', { name: /^English/ }));
    await screen.findByText('Fair pay you can see');
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    await screen.findByText('Speak up safely');
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    await screen.findByText('Your skills travel with you');
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    await screen.findByText('Speak up safely');
  });

  it('Escape skips the flow', async () => {
    const { onDone } = renderOnboarding();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(hasOnboarded()).toBe(true);
  });

  it('hello step has no axe violations (colour contrast excluded)', async () => {
    const { container } = renderOnboarding();
    expect(await violations(container)).toEqual([]);
  });

  it('language step has no axe violations (colour contrast excluded)', async () => {
    const { container } = renderOnboarding();
    await goToLanguageStep();
    expect(await violations(container)).toEqual([]);
  });

  it('hasOnboarded is false when storage throws, and markOnboarded does not throw', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    expect(hasOnboarded()).toBe(false);
    expect(() => markOnboarded()).not.toThrow();
  });
});
