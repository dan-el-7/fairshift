import type { Language } from '../../shared/types';
import { LANGUAGES, LANGUAGE_LABEL, tIn } from '../i18n';
import { speak } from '../speech';
import { Icon } from './Icon';
import '../language-picker.css';

const ENGLISH_NAME: Record<Language, string> = { en: '', hi: 'Hindi', ta: 'Tamil' };
const PROMPT: Record<Language, string> = { en: 'Choose your language', hi: 'अपनी भाषा चुनें', ta: 'மொழியைத் தேர்ந்தெடுக்கவும்' };

/** A small native-script signpost for people who cannot read the current UI language. */
export function LanguageHints({ language }: { language: Language }) {
  return <p class="language-hints">{LANGUAGES.filter((code) => code !== language).map((code) =>
    <span key={code} lang={code}>{PROMPT[code]}</span>,
  )}</p>;
}

/** Selection is a draft. Only the separate confirm action commits it; speakers never select. */
export function LanguageChoices({ value, onChange, name }: { value: Language; onChange: (language: Language) => void; name: string }) {
  return <div class="language-options" role="radiogroup" aria-label={tIn(value, 'language.options')}>
    {LANGUAGES.map((code) => <div key={code} class={`language-option${value === code ? ' is-selected' : ''}`}>
      <label class="language-option-select">
        <input type="radio" name={name} value={code} checked={value === code}
          data-current={value === code ? 'true' : undefined} data-autofocus={value === code ? '' : undefined}
          onChange={() => onChange(code)} />
        <span class="language-option-name">
          <strong lang={code}>{LANGUAGE_LABEL[code]}</strong>
          {ENGLISH_NAME[code] ? <small lang="en">{ENGLISH_NAME[code]}</small> : null}
        </span>
      </label>
      <button type="button" class="language-listen" lang={code}
        aria-label={tIn(code, 'language.listen', { language: LANGUAGE_LABEL[code] })}
        onClick={() => speak(LANGUAGE_LABEL[code], code)}>
        <Icon name="speaker" size={20} />
      </button>
    </div>)}
  </div>;
}
