import { speak } from '../speech';
import { t, useLang } from '../i18n';
import { Icon } from './Icon';

/** Reads `text` aloud in the current UI language. Round, 48px hit area. */
export function SpeakButton({ text }: { text: string }) {
  const lang = useLang();
  return (
    <button
      type="button"
      class="btn speak"
      aria-label={`${t('common.readAloud')}: ${text}`}
      onClick={() => speak(text, lang)}
    >
      <Icon name="speaker" size={20} />
    </button>
  );
}
