import { useEffect, useState } from 'preact/hooks';
import type { Language } from '../../shared/types';
import { detectScript } from '../langDetect';
import { LANGUAGE_LABEL, setLang, tIn, useLang } from '../i18n';
import { readPref, writePref } from '../prefs';

const DEBOUNCE_MS = 600;
const dismissKey = (lang: Language) => `fairshift.nudgeOff.${lang}`;

/**
 * Offers to switch the app when the text being written is in another language.
 * The banner is written in the detected language. "Not now" hides that language for this session.
 */
export function LanguageNudge({ text }: { text: string }) {
  const lang = useLang();
  const [suggested, setSuggested] = useState<Language | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      const detected = detectScript(text);
      const offered = detected !== null && detected !== lang && readPref(dismissKey(detected), 'session') !== '1';
      setSuggested(offered ? detected : null);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, lang]);

  const visible = suggested !== null && suggested !== lang ? suggested : null;

  return (
    <div class="qol-nudge" role="status">
      {visible && (
        <div class="qol-nudge-box" lang={visible}>
          <p class="qol-nudge-text">{tIn(visible, 'nudge.text', { language: LANGUAGE_LABEL[visible] })}</p>
          <div class="qol-nudge-actions">
            <button type="button" class="qol-nudge-yes" onClick={() => setLang(visible, { explicit: true })}>
              {tIn(visible, 'nudge.switch')}
            </button>
            <button
              type="button"
              class="qol-nudge-no"
              onClick={() => {
                writePref(dismissKey(visible), '1', 'session');
                setSuggested(null);
              }}
            >
              {tIn(visible, 'nudge.notNow')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
