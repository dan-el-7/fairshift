import { useCallback, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Language } from '../../shared/types';
import { hasExplicitChoice } from '../langDetect';
import { LANGUAGE_LABEL, LANGUAGES, setLang, t, useLang } from '../i18n';
import { PREF, readPref, writePref } from '../prefs';
import { speak } from '../speech';
import { Icon } from './Icon';

/** Fixed on purpose: the sheet must be readable whatever language is active. */
const SHEET_TITLE = 'Choose language · भाषा चुनें · மொழியைத் தேர்ந்தெடுக்கவும்';
const TITLE_ID = 'language-sheet-title';
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
}

interface LanguageSheetProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Modal language picker. Focus moves into the dialog, Tab stays inside it, Escape closes it,
 * and focus returns to the element that was focused before it opened.
 * Focusing or tapping a speaker button says the language's name in that language.
 */
export function LanguageSheet({ open, onClose }: LanguageSheetProps) {
  const lang = useLang();
  const dialogRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    if (dialog) {
      const initial = dialog.querySelector<HTMLElement>('[data-current="true"]') ?? focusableIn(dialog)[0];
      initial?.focus();
    }
    // Keep focus inside the dialog if something outside takes it.
    const pullBack = (event: FocusEvent) => {
      const target = event.target;
      if (dialog && target instanceof Node && !dialog.contains(target)) focusableIn(dialog)[0]?.focus();
    };
    document.addEventListener('focusin', pullBack);
    return () => {
      document.removeEventListener('focusin', pullBack);
      previous?.focus();
    };
  }, [open]);

  if (!open) return null;

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const items = focusableIn(dialogRef.current);
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    const inside = active instanceof Node && dialogRef.current.contains(active);
    if (event.shiftKey && (!inside || active === first)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (!inside || active === last)) {
      event.preventDefault();
      first.focus();
    }
  };

  const choose = (code: Language) => {
    setLang(code, { explicit: true });
    onClose();
  };

  return (
    <div
      class="qol-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        class="qol-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        onKeyDown={onKeyDown}
      >
        <div class="qol-dialog-head">
          <h2 id={TITLE_ID} class="qol-dialog-title">
            {SHEET_TITLE}
          </h2>
          <button type="button" class="qol-close" aria-label={t('common.close')} onClick={onClose}>
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <ul class="qol-lang-list">
          {LANGUAGES.map((code) => {
            const name = LANGUAGE_LABEL[code];
            const isCurrent = code === lang;
            return (
              <li class="qol-lang-row" key={code}>
                <button
                  type="button"
                  class="qol-hear"
                  lang={code}
                  aria-label={`${t('lang.hear')}: ${name}`}
                  onFocus={() => speak(name, code)}
                  onClick={() => speak(name, code)}
                >
                  <Icon name="speaker" size={26} />
                </button>
                <button
                  type="button"
                  class="qol-lang-choice"
                  lang={code}
                  data-current={isCurrent ? 'true' : 'false'}
                  onClick={() => choose(code)}
                >
                  <Icon name="globe" size={28} />
                  <span class="qol-lang-name">{name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/** Compact app-bar button that opens the language sheet. Renders its own sheet. */
export function LanguageHelpButton() {
  useLang();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" class="qol-lang-help" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <Icon name="globe" size={20} />
        <span>भाषा · மொழி · Language</span>
      </button>
      <LanguageSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/**
 * Open state for the first-visit language sheet: true on the first visit when the user has
 * made no explicit choice. Closing the sheet once (by any route) means it is not shown again.
 */
export function useFirstVisitLanguageSheet(): [boolean, (open: boolean) => void] {
  const [open, setOpenState] = useState<boolean>(
    () => !hasExplicitChoice() && readPref(PREF.languageSheetSeen) !== '1',
  );
  const setOpen = useCallback((next: boolean) => {
    if (!next) writePref(PREF.languageSheetSeen, '1');
    setOpenState(next);
  }, []);
  return [open, setOpen];
}
