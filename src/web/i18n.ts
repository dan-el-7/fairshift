import { useEffect, useState } from 'preact/hooks';
import type { Language } from '../shared/types';
import en from './i18n/en.json';
import hi from './i18n/hi.json';
import ta from './i18n/ta.json';

/** Every UI key. hi/ta must provide the same keys (enforced by the type below and by tests). */
export type TKey = keyof typeof en;
export type Params = Record<string, string | number>;

const DICTS: Record<Language, Record<TKey, string>> = { en, hi, ta };

export const LANGUAGES: Language[] = ['en', 'hi', 'ta'];
/** Native-script labels, shown in the language picker in every UI language. */
export const LANGUAGE_LABEL: Record<Language, string> = { en: 'English', hi: 'हिन्दी', ta: 'தமிழ்' };
export const LOCALE_TAG: Record<Language, string> = { en: 'en-IN', hi: 'hi-IN', ta: 'ta-IN' };

const STORAGE_KEY = 'fairshift.lang';
const IST = 'Asia/Kolkata';

function isLanguage(value: unknown): value is Language {
  return value === 'en' || value === 'hi' || value === 'ta';
}

function readStored(): Language | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return isLanguage(value) ? value : null;
  } catch {
    return null;
  }
}

let current: Language = readStored() ?? 'en';
const listeners = new Set<() => void>();

function applyDocumentLang(): void {
  if (typeof document !== 'undefined') document.documentElement.lang = current;
}
applyDocumentLang();

export function getLang(): Language {
  return current;
}

export function setLang(lang: Language): void {
  if (!isLanguage(lang) || lang === current) return;
  current = lang;
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Storage can be blocked (private mode). The choice then lasts for this page only.
  }
  applyDocumentLang();
  listeners.forEach((fn) => fn());
}

/** Re-renders the calling component when the UI language changes. */
export function useLang(): Language {
  const [lang, setState] = useState<Language>(current);
  useEffect(() => {
    const update = () => setState(current);
    listeners.add(update);
    update();
    return () => {
      listeners.delete(update);
    };
  }, []);
  return lang;
}

/** Translate a key in the current language, falling back to English, then to the key. */
export function t(key: TKey, params?: Params): string {
  const template: string = DICTS[current][key] ?? DICTS.en[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/** Indian digit grouping, two decimals: 123450 -> "₹1,234.50". Input is integer paise. */
export function formatMoney(paise: number): string {
  const sign = paise < 0 ? '-' : '';
  const abs = Math.round(Math.abs(paise));
  const rupees = Math.floor(abs / 100);
  const fraction = String(abs % 100).padStart(2, '0');
  return `${sign}₹${new Intl.NumberFormat('en-IN').format(rupees)}.${fraction}`;
}

/** Time of day in IST for an ISO timestamp, e.g. "8:05 am". */
export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE_TAG[current], {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: IST,
  }).format(new Date(iso));
}

/** IST calendar day (YYYY-MM-DD) of an ISO timestamp. */
export function istDay(iso: string): string {
  return new Date(Date.parse(iso) + 330 * 60 * 1000).toISOString().slice(0, 10);
}

/** Display a YYYY-MM-DD day, e.g. "27 Oct 2026". */
export function formatDay(ymd: string): string {
  return new Intl.DateTimeFormat(LOCALE_TAG[current], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${ymd}T00:00:00Z`));
}

/** Display a YYYY-MM pay period, e.g. "October 2026". */
export function periodLabel(period: string): string {
  return new Intl.DateTimeFormat(LOCALE_TAG[current], {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${period}-01T00:00:00Z`));
}
