import { PREF, readPref, writePref } from './prefs';

export type ThemeChoice = 'auto' | 'light' | 'dark';

/** The saved choice; 'auto' follows the device's light/dark setting. */
export function savedTheme(): ThemeChoice {
  const value = readPref(PREF.theme);
  return value === 'light' || value === 'dark' ? value : 'auto';
}

/**
 * Applies a choice by setting `data-theme` on <html>, which the stylesheets use to override
 * `prefers-color-scheme`. 'auto' removes the attribute so the device setting wins again.
 */
export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
}

/** Saves and applies a choice. */
export function setTheme(choice: ThemeChoice): void {
  writePref(PREF.theme, choice === 'auto' ? '' : choice);
  applyTheme(choice);
}
