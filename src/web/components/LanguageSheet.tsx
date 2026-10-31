import { createPortal } from 'preact/compat';
import { useCallback, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Language } from '../../shared/types';
import { hasExplicitChoice } from '../langDetect';
import { setLang, tIn, useLang } from '../i18n';
import { PREF, readPref, writePref } from '../prefs';
import { Icon } from './Icon';
import { LanguageChoices, LanguageHints } from './LanguageChoices';
import { useModalScrollLock } from './useModalScrollLock';

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
 * Only speaker activation plays audio. Selection stays local until the user confirms.
 */
export function LanguageSheet({ open, onClose }: LanguageSheetProps) {
  const lang = useLang();
  return open ? <LanguageDialog initialLanguage={lang} onClose={onClose} /> : null;
}

function LanguageDialog({ initialLanguage, onClose }: { initialLanguage: Language; onClose: () => void }) {
  useModalScrollLock();
  const [draft, setDraft] = useState(initialLanguage);
  const dialogRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
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
  }, []);

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

  const confirm = () => {
    setLang(draft, { explicit: true });
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
        class="qol-dialog language-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        onKeyDown={onKeyDown}
      >
        <div class="qol-dialog-head">
          <div>
            <h2 id={TITLE_ID} class="qol-dialog-title" lang={initialLanguage}>{tIn(initialLanguage, 'language.settingsTitle')}</h2>
            <LanguageHints language={initialLanguage} />
          </div>
          <button type="button" class="qol-close" aria-label={tIn(initialLanguage, 'common.close')} onClick={onClose}>
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <form onSubmit={(event) => { event.preventDefault(); confirm(); }}>
          <LanguageChoices value={draft} onChange={setDraft} name="settings-language" />
          <div class="language-dialog-footer">
            <button type="submit" class="btn btn-primary" lang={draft}>{tIn(draft, 'language.use')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Fixed on purpose, like the sheet title: the button must be findable whatever language is active. */
const LANG_BUTTON_LABEL = 'Language · भाषा · மொழி';

/** Round app-bar icon button that opens the language sheet. Renders its own sheet. */
export function LanguageHelpButton() {
  useLang();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        class="qol-lang-help"
        aria-haspopup="dialog"
        aria-label={LANG_BUTTON_LABEL}
        title={LANG_BUTTON_LABEL}
        onClick={() => setOpen(true)}
      >
        <Icon name="translate" size={24} />
      </button>
      {/* Portalled to <body>: the app bar's backdrop-filter would otherwise become the containing
          block for the sheet's fixed overlay and squeeze it into the bar. */}
      {typeof document === 'undefined'
        ? null
        : createPortal(<LanguageSheet open={open} onClose={() => setOpen(false)} />, document.body)}
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
