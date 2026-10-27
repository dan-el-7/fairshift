import { useLayoutEffect, useState } from 'preact/hooks';
import { t, useLang } from '../i18n';
import { PREF, readPref, writePref } from '../prefs';

const CLASS = 'text-lg';

/** Applies the saved text size to <html>. Call once at startup so the size is right before the toggle mounts. */
export function applySavedTextSize(): void {
  document.documentElement.classList.toggle(CLASS, readPref(PREF.textLarge) === '1');
}

/** Toggles a larger text mode (html.text-lg, see qol.css). The choice is remembered on this device. */
export function TextSizeToggle() {
  useLang();
  const [large, setLarge] = useState(() => readPref(PREF.textLarge) === '1');

  useLayoutEffect(() => {
    document.documentElement.classList.toggle(CLASS, large);
  }, [large]);

  const label = t('textSize.label');
  return (
    <button
      type="button"
      class="qol-text-size"
      aria-pressed={large ? 'true' : 'false'}
      aria-label={label}
      title={label}
      onClick={() => {
        const next = !large;
        writePref(PREF.textLarge, next ? '1' : '0');
        setLarge(next);
      }}
    >
      <span class="qol-text-size-mark" aria-hidden="true">Aa</span>
    </button>
  );
}
