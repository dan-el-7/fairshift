/** Keys for small per-browser preferences. Only convenience state belongs here, never data that must persist. */
export const PREF = {
  /** Explicit language choice made by the user (the key i18n.ts has always used). */
  language: 'fairshift.lang',
  /** '1' when the larger text mode is on. */
  textLarge: 'fairshift.textLarge',
  /** '1' once the first-visit language sheet has been closed. */
  languageSheetSeen: 'fairshift.langSheetSeen',
  /** Explicit 'auto', 'light' or 'dark'; absent defaults to dark. Empty is the legacy Auto value. */
  theme: 'fairshift.theme',
} as const;

export type PrefScope = 'local' | 'session';

/** Storage can be blocked (private mode, disabled site data), so every access is guarded. */
function storageFor(scope: PrefScope): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return scope === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readPref(key: string, scope: PrefScope = 'local'): string | null {
  try {
    return storageFor(scope)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writePref(key: string, value: string, scope: PrefScope = 'local'): void {
  try {
    storageFor(scope)?.setItem(key, value);
  } catch {
    // Blocked storage: the preference lasts for this page only.
  }
}
