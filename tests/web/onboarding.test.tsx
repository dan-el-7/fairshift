// @vitest-environment jsdom
import { render, cleanup, fireEvent, screen, waitFor } from '@testing-library/preact';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Onboarding,
  hasOnboarded,
  hasSeenIntro,
  markIntroSeen,
  markOnboarded,
  type OnboardingMode,
} from '../../src/web/components/Onboarding';
import * as i18n from '../../src/web/i18n';
import type { Role } from '../../src/shared/types';

vi.mock('../../src/web/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/web/i18n')>();
  return { ...actual, setLang: vi.fn(actual.setLang) };
});

const WORKER_1 = 'Check in with one tap';
const WORKER_2 = 'Your pay, explained';
const WORKER_3 = 'Speak up safely';
const WORKER_4 = 'Your skills go with you';
const ADMIN_1 = 'Your site at a glance';
const WORKER_1_TA = 'ஒரே தட்டலில் வருகை பதிவு';

/** Runs axe on the container. Only the colour-contrast rule is disabled. */
async function violations(container: Element) {
  const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`);
}

function renderOnboarding(props: { mode?: OnboardingMode; role?: Role | null; greet?: boolean } = {}) {
  const onDone = vi.fn();
  const view = render(<Onboarding onDone={onDone} {...props} />);
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

describe('Onboarding first visit', () => {
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
    expect(screen.getByRole('radio', { name: /^English/ })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /^தமிழ்/ })).toBeTruthy();
  });

  it('hello, then language, then closes with no intro slides', async () => {
    const { onDone } = renderOnboarding();
    await goToLanguageStep();
    fireEvent.click(screen.getByRole('radio', { name: /^English/ }));
    fireEvent.click(screen.getByRole('button', { name: i18n.tIn('en', 'language.continue') }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(localStorage.getItem('fairshift.onboarded')).toBe('1');
    expect(localStorage.getItem('fairshift.intro.worker')).toBeNull();
    expect(localStorage.getItem('fairshift.intro.admin')).toBeNull();
    expect(screen.queryByText(WORKER_1)).toBeNull();
  });

  it('choosing Tamil calls setLang with ta', async () => {
    const { onDone } = renderOnboarding();
    await goToLanguageStep();
    fireEvent.click(screen.getByRole('radio', { name: /^தமிழ்/ }));
    expect(i18n.setLang).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: i18n.tIn('ta', 'language.continue') }));
    expect(i18n.setLang).toHaveBeenCalledWith('ta');
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  });

  it('Skip calls onDone and records onboarding', async () => {
    const { onDone } = renderOnboarding();
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(localStorage.getItem('fairshift.onboarded')).toBe('1');
    expect(hasOnboarded()).toBe(true);
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

describe('Onboarding role intro', () => {
  it('worker intro starts at the first worker slide, with four slides and no hello step', () => {
    renderOnboarding({ mode: 'intro', role: 'worker' });
    expect(screen.getByRole('heading', { name: WORKER_1 })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Tap to begin/ })).toBeNull();
    expect(screen.getByRole('img', { name: 'Step 1 of 4' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });

  it('with greet, the intro runs the full flow: hello, language, then the role slides', async () => {
    renderOnboarding({ mode: 'intro', role: 'worker', greet: true });
    await goToLanguageStep();
    fireEvent.click(screen.getByRole('radio', { name: /^English/ }));
    fireEvent.click(screen.getByRole('button', { name: i18n.tIn('en', 'language.continue') }));
    expect(await screen.findByRole('heading', { name: WORKER_1 })).toBeTruthy();
    // Back from the first slide returns to the language step.
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
  });

  it("worker intro walks through all four worker slides, then Let's go marks it seen and closes", async () => {
    const { onDone } = renderOnboarding({ mode: 'intro', role: 'worker' });
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    await screen.findByRole('heading', { name: WORKER_2 });
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    await screen.findByRole('heading', { name: WORKER_3 });
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    await screen.findByRole('heading', { name: WORKER_4 });
    fireEvent.click(screen.getByRole('button', { name: "Let's go" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(localStorage.getItem('fairshift.intro.worker')).toBe('1');
    expect(hasSeenIntro('worker')).toBe(true);
    expect(hasSeenIntro('admin')).toBe(false);
  });

  it('worker intro shows in the current UI language', async () => {
    i18n.setLang('ta', { explicit: false });
    renderOnboarding({ mode: 'intro', role: 'worker' });
    expect(await screen.findByText(WORKER_1_TA)).toBeTruthy();
  });

  it('admin intro shows admin slides', async () => {
    renderOnboarding({ mode: 'intro', role: 'admin' });
    expect(screen.getByRole('heading', { name: ADMIN_1 })).toBeTruthy();
    expect(screen.queryByText(WORKER_1)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('heading', { name: 'Act on reports fast' });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('heading', { name: 'Spot burnout early' });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('heading', { name: 'QR kiosk check-in' });
  });

  it('Skip marks that role intro seen and closes', async () => {
    const { onDone } = renderOnboarding({ mode: 'intro', role: 'worker' });
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(localStorage.getItem('fairshift.intro.worker')).toBe('1');
    expect(localStorage.getItem('fairshift.intro.admin')).toBeNull();
  });

  it('Escape marks the admin intro seen', async () => {
    const { onDone } = renderOnboarding({ mode: 'intro', role: 'admin' });
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(localStorage.getItem('fairshift.intro.admin')).toBe('1');
  });

  it('a role slide has no axe violations (colour contrast excluded)', async () => {
    const { container } = renderOnboarding({ mode: 'intro', role: 'worker' });
    expect(await violations(container)).toEqual([]);
  });
});

describe('Onboarding replay (#/welcome)', () => {
  it('replay with a role goes hello, language, then that role slides', async () => {
    renderOnboarding({ mode: 'replay', role: 'admin' });
    await goToLanguageStep();
    fireEvent.click(screen.getByRole('radio', { name: /^English/ }));
    fireEvent.click(screen.getByRole('button', { name: i18n.tIn('en', 'language.continue') }));
    expect(await screen.findByRole('heading', { name: ADMIN_1 })).toBeTruthy();
  });

  it('replay without a role closes after the language step', async () => {
    const { onDone } = renderOnboarding({ mode: 'replay' });
    await goToLanguageStep();
    fireEvent.click(screen.getByRole('radio', { name: /^English/ }));
    fireEvent.click(screen.getByRole('button', { name: i18n.tIn('en', 'language.continue') }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(ADMIN_1)).toBeNull();
  });
});

describe('role intro storage helpers', () => {
  it('hasSeenIntro is false when storage throws, and markIntroSeen does not throw', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    expect(hasSeenIntro('worker')).toBe(false);
    expect(() => markIntroSeen('worker')).not.toThrow();
  });
});
