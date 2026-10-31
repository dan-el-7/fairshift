// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Language } from '../../src/shared/types';
import { LanguageChoices } from '../../src/web/components/LanguageChoices';
import { Onboarding } from '../../src/web/components/Onboarding';
import { getLang, setLang, tIn } from '../../src/web/i18n';
import { speak } from '../../src/web/speech';
vi.mock('../../src/web/speech', () => ({ speak: vi.fn() }));
beforeEach(() => { setLang('en', { explicit: false }); localStorage.clear(); vi.mocked(speak).mockClear(); });
afterEach(() => { cleanup(); setLang('en', { explicit: false }); localStorage.clear(); });

it('plays audio only on speaker activation, without selecting or committing that language', () => {
  const select = vi.fn();
  render(<LanguageChoices value="en" onChange={select} name="test-language" />);
  const tamil = screen.getByRole('radio', { name: /^தமிழ்/ });
  fireEvent.mouseOver(tamil.closest('label')!);
  fireEvent.focus(tamil);
  expect(speak).not.toHaveBeenCalled();
  const listen = screen.getByRole('button', { name: tIn('ta', 'language.listen', { language: 'தமிழ்' }) });
  fireEvent.focus(listen);
  fireEvent.mouseOver(listen);
  expect(speak).not.toHaveBeenCalled();
  fireEvent.click(listen);
  expect(speak).toHaveBeenCalledWith('தமிழ்', 'ta');
  expect(select).not.toHaveBeenCalled();
  expect(getLang()).toBe('en');
});

it.each(['en', 'hi', 'ta'] as Language[])('keeps a %s selection on the language step until Continue', async (language) => {
  const done = vi.fn();
  render(<Onboarding mode="intro" role="worker" greet onDone={done} />);
  fireEvent.click(screen.getByRole('button', { name: /Tap to begin/ }));
  const dialog = screen.getByRole('dialog');
  const labels = { en: 'English', hi: 'हिन्दी', ta: 'தமிழ்' };
  fireEvent.click(within(dialog).getByRole('radio', { name: new RegExp(`^${labels[language]}`) }));
  expect(within(dialog).getByRole('radiogroup')).toBeTruthy();
  expect(getLang()).toBe('en');
  expect(done).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: tIn(language, 'language.continue') }));
  await waitFor(() => expect(within(dialog).queryByRole('radiogroup')).toBeNull());
  expect(getLang()).toBe(language);
  expect(localStorage.getItem('fairshift.lang')).toBe(language);
  expect(within(dialog).getByRole('img').getAttribute('aria-label')).toBe(
    language === 'en' ? 'Step 1 of 4' : language === 'hi' ? 'चरण 1 / 4' : 'படி 1 / 4',
  );
});
