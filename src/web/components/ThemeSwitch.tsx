import { useState } from 'preact/hooks';
import { t, useLang } from '../i18n';
import { savedTheme, setTheme, type ThemeChoice } from '../theme';
import { Icon, type IconName } from './Icon';

const OPTIONS: Array<{ value: ThemeChoice; icon: IconName; label: 'theme.auto' | 'theme.light' | 'theme.dark' }> = [
  { value: 'auto', icon: 'contrast', label: 'theme.auto' },
  { value: 'light', icon: 'sun', label: 'theme.light' },
  { value: 'dark', icon: 'moon', label: 'theme.dark' },
];

/** Three-way Auto / Light / Dark switch, shown as a compact segmented pill. */
export function ThemeSwitch() {
  useLang();
  const [choice, setChoice] = useState<ThemeChoice>(savedTheme);
  return (
    <div class="theme-switch" role="radiogroup" aria-label={t('theme.label')}>
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={choice === option.value}
          title={t(option.label)}
          onClick={() => {
            setTheme(option.value);
            setChoice(option.value);
          }}
        >
          <Icon name={option.icon} size={16} />
          <span>{t(option.label)}</span>
        </button>
      ))}
    </div>
  );
}
