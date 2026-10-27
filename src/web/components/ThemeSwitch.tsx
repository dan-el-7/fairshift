import { useState } from 'preact/hooks';
import { t, useLang } from '../i18n';
import { savedTheme, setTheme, type ThemeChoice } from '../theme';
import { Icon, type IconName } from './Icon';

const OPTIONS: { value: ThemeChoice; icon: IconName; label: 'theme.auto' | 'theme.light' | 'theme.dark' }[] = [
  { value: 'auto', icon: 'contrast', label: 'theme.auto' },
  { value: 'light', icon: 'sun', label: 'theme.light' },
  { value: 'dark', icon: 'moon', label: 'theme.dark' },
];

/**
 * Three-way Auto / Light / Dark switch, shown as a compact segmented pill.
 * Native radio inputs give arrow-key movement and one tab stop; the input is hidden visually, not removed.
 */
export function ThemeSwitch() {
  useLang();
  const [choice, setChoice] = useState<ThemeChoice>(savedTheme);
  return (
    <fieldset class="theme-switch">
      <legend class="visually-hidden">{t('theme.label')}</legend>
      {OPTIONS.map((option) => (
        <label key={option.value} title={t(option.label)}>
          <input
            type="radio"
            name="theme"
            value={option.value}
            checked={choice === option.value}
            onChange={() => {
              setTheme(option.value);
              setChoice(option.value);
            }}
          />
          <Icon name={option.icon} size={16} />
          <span>{t(option.label)}</span>
        </label>
      ))}
    </fieldset>
  );
}
