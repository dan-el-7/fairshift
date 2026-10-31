// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import axe from 'axe-core';
import { useState } from 'preact/hooks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browserLanguage, detectScript, initialLanguage } from '../../src/web/langDetect';
import { getLang, setLang, tIn } from '../../src/web/i18n';
import { LanguageSheet } from '../../src/web/components/LanguageSheet';
import { LanguageNudge } from '../../src/web/components/LanguageNudge';
import { TextSizeToggle } from '../../src/web/components/TextSizeToggle';

const HINDI = 'मैं आज सुबह काम पर गया था और शाम को वापस आया';
const TAMIL = 'நான் இன்று காலை வேலைக்குச் சென்றேன், மாலை திரும்பி வந்தேன்';
const ENGLISH = 'Please check the safety gear before you start work today';

beforeEach(() => {
  // setLang saves an explicit choice, so clear storage after resetting the language.
  setLang('en');
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setLang('en');
  document.documentElement.classList.remove('text-lg');
  Reflect.deleteProperty(window.navigator, 'languages');
});

/** Fresh i18n module, so startup and adoption logic can be tested from a clean state. */
async function freshI18n() {
  vi.resetModules();
  return import('../../src/web/i18n');
}

describe('detectScript', () => {
  it('recognises a Hindi sentence', () => {
    expect(detectScript(HINDI)).toBe('hi');
  });

  it('recognises a Tamil sentence', () => {
    expect(detectScript(TAMIL)).toBe('ta');
  });

  it('recognises English', () => {
    expect(detectScript(ENGLISH)).toBe('en');
  });

  it('follows the dominant script in mixed text', () => {
    expect(detectScript('मेरा नाम Ravi है और मैं Site 3 पर काम करता हूँ')).toBe('hi');
    expect(detectScript('Please check the safety gear, ठीक है')).toBe('en');
  });

  it('returns null for text that is too short', () => {
    expect(detectScript('हा')).toBeNull();
    expect(detectScript('நா')).toBeNull();
    expect(detectScript('Hi')).toBeNull();
    expect(detectScript('')).toBeNull();
    expect(detectScript('123 456')).toBeNull();
  });
});

describe('browserLanguage', () => {
  it('returns the first supported language, by primary subtag', () => {
    expect(browserLanguage(['ta-IN', 'en'])).toBe('ta');
    expect(browserLanguage(['hi-IN'])).toBe('hi');
    expect(browserLanguage(['en-US', 'hi'])).toBe('en');
  });

  it('skips unsupported languages and returns null when none match', () => {
    expect(browserLanguage(['fr-FR', 'de'])).toBeNull();
    expect(browserLanguage(['mr-IN', 'ne-NP'])).toBeNull();
    expect(browserLanguage(['mr-IN', 'hi-IN'])).toBe('hi');
  });
});

describe('initialLanguage and explicit choice', () => {
  it('uses the saved explicit choice first', () => {
    window.localStorage.setItem('fairshift.lang', 'ta');
    Object.defineProperty(window.navigator, 'languages', { value: ['hi-IN'], configurable: true });
    expect(initialLanguage()).toBe('ta');
  });

  it('falls back to the browser language, then English', () => {
    Object.defineProperty(window.navigator, 'languages', { value: ['hi-IN'], configurable: true });
    expect(initialLanguage()).toBe('hi');
    Object.defineProperty(window.navigator, 'languages', { value: ['fr-FR'], configurable: true });
    expect(initialLanguage()).toBe('en');
  });

  it('an explicit choice beats adoptUserLanguage', async () => {
    const i18n = await freshI18n();
    i18n.setLang('hi');
    i18n.adoptUserLanguage('ta');
    expect(i18n.getLang()).toBe('hi');
  });

  it('a saved explicit choice beats adoptUserLanguage after a reload', async () => {
    window.localStorage.setItem('fairshift.lang', 'hi');
    const i18n = await freshI18n();
    i18n.adoptUserLanguage('ta');
    expect(i18n.getLang()).toBe('hi');
  });

  it('adoptUserLanguage switches when there was no explicit choice, and does not save it', async () => {
    const i18n = await freshI18n();
    i18n.adoptUserLanguage('ta');
    expect(i18n.getLang()).toBe('ta');
    expect(window.localStorage.getItem('fairshift.lang')).toBeNull();
  });
});

describe('LanguageNudge', () => {
  it('offers the detected language after the debounce for Tamil text when the UI is English', async () => {
    vi.useFakeTimers();
    render(<LanguageNudge text={TAMIL} />);
    expect(screen.queryByRole('button', { name: tIn('ta', 'nudge.switch') })).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(screen.getByRole('status').textContent).toContain(tIn('ta', 'nudge.text', { language: 'தமிழ்' }));
    expect(screen.getByRole('button', { name: tIn('ta', 'nudge.switch') })).toBeTruthy();
  });

  it('does not appear for English text when the UI is English', async () => {
    vi.useFakeTimers();
    render(<LanguageNudge text={ENGLISH} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.queryByRole('button', { name: tIn('en', 'nudge.switch') })).toBeNull();
  });

  it('switching explicitly changes the language', async () => {
    vi.useFakeTimers();
    render(<LanguageNudge text={TAMIL} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    fireEvent.click(screen.getByRole('button', { name: tIn('ta', 'nudge.switch') }));
    expect(getLang()).toBe('ta');
    expect(window.localStorage.getItem('fairshift.lang')).toBe('ta');
  });

  it('"Not now" hides that language for the rest of the session', async () => {
    vi.useFakeTimers();
    const { rerender } = render(<LanguageNudge text={TAMIL} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    fireEvent.click(screen.getByRole('button', { name: tIn('ta', 'nudge.notNow') }));
    expect(screen.queryByRole('button', { name: tIn('ta', 'nudge.switch') })).toBeNull();

    rerender(<LanguageNudge text={TAMIL + ' மீண்டும்'} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(screen.queryByRole('button', { name: tIn('ta', 'nudge.switch') })).toBeNull();
  });
});

describe('LanguageSheet', () => {
  function Host() {
    const [open, setOpen] = useState(false);
    return (
      <main>
        <button type="button" id="trigger" onClick={() => setOpen(true)}>
          Open
        </button>
        <LanguageSheet open={open} onClose={() => setOpen(false)} />
      </main>
    );
  }

  async function openSheet() {
    const trigger = screen.getByRole('button', { name: 'Open' });
    trigger.focus();
    fireEvent.click(trigger);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
    return screen.getByRole('dialog');
  }

  it('is an accessible dialog with the three greetings and three language choices', async () => {
    render(<Host />);
    const dialog = await openSheet();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByRole('heading', { name: 'Language' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /^हिन्दी/ })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /^தமிழ்/ })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'English' })).toBeTruthy();
  });

  it('moves focus into the dialog and keeps Tab inside it', async () => {
    render(<Host />);
    const dialog = await openSheet();
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    const last = screen.getByRole('button', { name: 'Use English' });
    last.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(last);

    const first = screen.getByRole('button', { name: 'Close' });
    first.focus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Use English' }));
  });

  it('Escape closes it and returns focus to the trigger', async () => {
    render(<Host />);
    const dialog = await openSheet();
    expect(document.documentElement.style.overflow).toBe('hidden');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open' }));
    expect(document.documentElement.style.overflow).toBe('');
  });

  it('previews a choice and commits it only after explicit confirmation', async () => {
    render(<Host />);
    await openSheet();
    fireEvent.click(screen.getByRole('radio', { name: /^हिन्दी/ }));
    expect(getLang()).toBe('en');
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: tIn('hi', 'language.use') }));
    expect(getLang()).toBe('hi');
    expect(window.localStorage.getItem('fairshift.lang')).toBe('hi');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.documentElement.style.overflow).toBe('');
  });

  it('closing discards the draft and restores the saved selection on reopening', async () => {
    render(<Host />);
    await openSheet();
    fireEvent.click(screen.getByRole('radio', { name: /^தமிழ்/ }));
    fireEvent.click(screen.getByRole('button', { name: tIn('en', 'common.close') }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(getLang()).toBe('en');
    await openSheet();
    expect(screen.getByRole('radio', { name: 'English' })).toHaveProperty('checked', true);
  });

  it('has no axe violations (colour contrast excluded)', async () => {
    render(<Host />);
    const dialog = await openSheet();
    const results = await axe.run(dialog.closest('main') as Element, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});

describe('TextSizeToggle', () => {
  it('toggles the text-lg class on html and reports aria-pressed', () => {
    render(<TextSizeToggle />);
    const button = screen.getByRole('button', { name: /larger text/i });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(document.documentElement.classList.contains('text-lg')).toBe(false);

    fireEvent.click(button);
    expect(document.documentElement.classList.contains('text-lg')).toBe(true);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(window.localStorage.getItem('fairshift.textLarge')).toBe('1');

    fireEvent.click(button);
    expect(document.documentElement.classList.contains('text-lg')).toBe(false);
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });
});
