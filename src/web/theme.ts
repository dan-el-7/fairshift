import { PREF, readPref, writePref } from './prefs';

export type ThemeChoice = 'auto' | 'light' | 'dark';

/** New visitors start dark; explicit Auto (including the old empty value) follows the device. */
export function savedTheme(): ThemeChoice {
  const value = readPref(PREF.theme);
  if (value === 'auto' || value === '') return 'auto';
  return value === 'light' ? 'light' : 'dark';
}

/**
 * Applies a choice by setting `data-theme` on <html>, which the stylesheets use to override
 * `prefers-color-scheme`. 'auto' removes the attribute so the device setting wins again.
 */
export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    const light = choice === 'auto' ? meta.media.includes('light') : choice === 'light';
    meta.content = light ? '#fafafa' : '#09090b';
  });
}

/**
 * Forces the frosted-glass layers to repaint. Chromium on Android can leave stale or blank tiles
 * under backdrop-filter layers after a large colour change; dropping the blur for one frame makes
 * it re-rasterise them. The frame without blur is not noticeable.
 */
function repaintGlass(): void {
  const root = document.documentElement;
  root.classList.add('theme-repaint');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => root.classList.remove('theme-repaint'));
  });
}

/** Saves and applies a choice. */
export function setTheme(choice: ThemeChoice): void {
  writePref(PREF.theme, choice);
  applyTheme(choice);
  repaintGlass();
}
