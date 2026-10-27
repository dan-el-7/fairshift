import { speak } from '../speech';
import { t, useLang } from '../i18n';

/** Reads `text` aloud in the current UI language. Renders a 48px button. */
export function SpeakButton({ text }: { text: string }) {
  const lang = useLang();
  return (
    <button
      type="button"
      class="btn btn-icon speak"
      aria-label={`${t('common.readAloud')}: ${text}`}
      onClick={() => speak(text, lang)}
    >
      <span aria-hidden="true">🔊</span>
    </button>
  );
}
