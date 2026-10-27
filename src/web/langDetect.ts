import type { Language } from '../shared/types';
import { PREF, readPref } from './prefs';

const LANGUAGES_SUPPORTED: readonly Language[] = ['en', 'hi', 'ta'];

function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES_SUPPORTED as readonly string[]).includes(value);
}

/**
 * Guesses the language of a piece of text by its script.
 * Devanagari (U+0900-097F) and Tamil (U+0B80-0BFF) letters are counted against Latin letters.
 * Returns 'hi' or 'ta' when that script is at least 40% of the letters (and at least 3 of them),
 * 'en' when Latin letters dominate (at least 8 of them), otherwise null.
 */
type Script = 'devanagari' | 'tamil' | 'latin';

/** The script a character counts towards, or null for spaces, digits, punctuation and other scripts. */
function scriptOf(ch: string): Script | null {
  if (!/[\p{L}\p{M}]/u.test(ch)) return null;
  const cp = ch.codePointAt(0) ?? 0;
  if (cp >= 0x0900 && cp <= 0x097f) return 'devanagari';
  if (cp >= 0x0b80 && cp <= 0x0bff) return 'tamil';
  if (/\p{L}/u.test(ch) && /\p{Script=Latin}/u.test(ch)) return 'latin';
  return null;
}

export function detectScript(text: string): Language | null {
  const counts: Record<Script, number> = { devanagari: 0, tamil: 0, latin: 0 };
  for (const ch of text) {
    const script = scriptOf(ch);
    if (script) counts[script]++;
  }
  const { devanagari, tamil, latin } = counts;
  const total = devanagari + tamil + latin;
  if (total === 0) return null;
  if (devanagari >= 3 && devanagari / total >= 0.4) return 'hi';
  if (tamil >= 3 && tamil / total >= 0.4) return 'ta';
  if (latin >= 8 && latin / total > 0.5) return 'en';
  return null;
}

function defaultBrowserLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  const list = (navigator.languages as readonly string[] | undefined) ?? [];
  return navigator.language ? [...list, navigator.language] : [...list];
}

/**
 * First browser language that FairShift supports (hi, ta, en by primary subtag), in browser order.
 * Other languages, including Marathi and Nepali, are skipped rather than guessed.
 */
export function browserLanguage(langs: readonly string[] = defaultBrowserLanguages()): Language | null {
  for (const tag of langs) {
    const primary = tag.trim().toLowerCase().split('-')[0] ?? '';
    if (isLanguage(primary)) return primary;
  }
  return null;
}

/** The language the user explicitly chose and saved, or null. */
export function savedLanguage(): Language | null {
  const value = readPref(PREF.language);
  return isLanguage(value) ? value : null;
}

/** True when the user has picked a language (it is saved). Automatic switches never count. */
export function hasExplicitChoice(): boolean {
  return savedLanguage() !== null;
}

/** Startup language: saved explicit choice, then browser language, then English. */
export function initialLanguage(): Language {
  return savedLanguage() ?? browserLanguage() ?? 'en';
}
