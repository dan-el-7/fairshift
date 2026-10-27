// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import en from '../../src/web/i18n/en.json';
import hi from '../../src/web/i18n/hi.json';
import ta from '../../src/web/i18n/ta.json';
import { formatMoney, getLang, setLang, t } from '../../src/web/i18n';

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

describe('i18n dictionaries', () => {
  it('hi and ta have exactly the same keys as en', () => {
    const enKeys = Object.keys(en).sort();
    expect(Object.keys(hi).sort()).toEqual(enKeys);
    expect(Object.keys(ta).sort()).toEqual(enKeys);
  });

  it('no value is empty', () => {
    for (const dict of [en, hi, ta]) {
      for (const [key, value] of Object.entries(dict)) {
        expect(value.trim(), key).not.toBe('');
      }
    }
  });

  it('translations use the same interpolation placeholders as English', () => {
    for (const [key, value] of Object.entries(en)) {
      expect(placeholders(hi[key as keyof typeof hi]), `hi ${key}`).toBe(placeholders(value));
      expect(placeholders(ta[key as keyof typeof ta]), `ta ${key}`).toBe(placeholders(value));
    }
  });

  it('every hazard category from both industries has a label', () => {
    const categories = [
      'fall_height', 'scaffolding', 'electrical', 'heavy_machinery', 'ppe_missing', 'heat_stress', 'harassment',
      'wage_issue', 'other', 'chemical_lab', 'slippery_floor', 'fire_safety', 'workload',
    ];
    for (const c of categories) expect(en).toHaveProperty(`hazard.${c}`);
  });
});

describe('t()', () => {
  afterEach(() => setLang('en'));

  it('interpolates named parameters', () => {
    expect(t('pay.base.daily', { days: 22, rate: '₹750.00' })).toBe('22 days × ₹750.00');
  });

  it('leaves unknown placeholders visible so missing params are noticed', () => {
    expect(t('pay.base.daily', { days: 3 })).toBe('3 days × {rate}');
  });

  it('switches language and sets the document language', () => {
    setLang('hi');
    expect(getLang()).toBe('hi');
    expect(document.documentElement.lang).toBe('hi');
    expect(t('pay.title')).toBe(hi['pay.title']);
    setLang('ta');
    expect(document.documentElement.lang).toBe('ta');
  });

  it('persists the chosen language in localStorage', () => {
    setLang('ta');
    expect(window.localStorage.getItem('fairshift.lang')).toBe('ta');
  });
});

describe('formatMoney', () => {
  it('formats integer paise with Indian grouping and two decimals', () => {
    expect(formatMoney(123450)).toBe('₹1,234.50');
    expect(formatMoney(75000)).toBe('₹750.00');
    expect(formatMoney(100000000)).toBe('₹10,00,000.00');
    expect(formatMoney(5)).toBe('₹0.05');
    expect(formatMoney(0)).toBe('₹0.00');
  });
});
