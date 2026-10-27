import type { Role } from '../../shared/types';
import { useLang } from '../i18n';
import '../onboarding.css';
import { COPY, TITLE_ID } from './onboarding/content';
import { HelloStep, LanguageStep, SlidesStep } from './onboarding/parts';
import { type OnboardingMode, useOnboardingFlow } from './onboarding/flow';

export { forgetIntro, hasOnboarded, hasSeenIntro, markIntroSeen, markOnboarded } from './onboarding/storage';
export type { OnboardingMode };

export interface OnboardingProps {
  onDone: () => void;
  mode?: OnboardingMode;
  /** Required for intro; optional for replay, where it adds the role's slides. */
  role?: Role | null;
  /** Intro only: the full flow (hello, language, then the role's slides). */
  greet?: boolean;
}

/**
 * Onboarding overlay. Mount it for the mode that applies; onDone runs after the exit animation
 * (or at once with reduced motion). See OnboardingMode for each flow.
 */
export function Onboarding({ onDone, mode = 'first', role = null, greet = false }: OnboardingProps) {
  const uiLang = useLang();
  const copy = COPY[uiLang];
  const slideRole: Role | null = mode === 'first' ? null : role;
  const slideSet = slideRole ? { role: slideRole, slides: copy.roles[slideRole] } : null;
  const flow = useOnboardingFlow({ mode, slideRole, slideCount: slideSet?.slides.length ?? 0, openWithHello: greet, onDone });

  return (
    <div
      ref={flow.dialogRef}
      class={`ob-root${flow.exiting ? ' is-exiting' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={TITLE_ID}
      onPointerDown={flow.arm}
    >
      <div class="ob-blobs" aria-hidden="true">
        <span class="ob-blob ob-blob-teal" />
        <span class="ob-blob ob-blob-mint" />
        <span class="ob-blob ob-blob-indigo" />
        <span class="ob-blob ob-blob-amber" />
      </div>
      <div class="ob-frost" aria-hidden="true" />

      <div class="ob-stage">
        <div class="ob-top">
          <button type="button" class="ob-btn ob-btn-quiet" onClick={flow.complete}>
            {copy.skip}
          </button>
        </div>

        {flow.step === 'hello' && <HelloStep flow={flow} />}
        {flow.step === 'language' && <LanguageStep flow={flow} copy={copy} />}
        {flow.step === 'slides' && slideSet && (
          <SlidesStep
            flow={flow}
            copy={copy}
            uiLang={uiLang}
            role={slideSet.role}
            slides={slideSet.slides}
          />
        )}
      </div>
    </div>
  );
}
