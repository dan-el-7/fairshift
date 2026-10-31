import type { Language, Role } from '../../../shared/types';
import { useState } from 'preact/hooks';
import { getLang, tIn } from '../../i18n';
import { LanguageChoices, LanguageHints } from '../LanguageChoices';
import { Icon } from '../Icon';
import { speak } from '../../speech';
import type { OnboardingFlow } from './flow';
import { HELLO_PATH, HELLO_VIEWBOX } from './helloPath';
import { ART, COPY, HELLO_LABEL, ORDER, TAP_ID, TAP_LABEL, TITLE_ID, type ArtKind, type Copy, type Slides } from './content';

/** Line illustrations in the same style as the rest of the app. */
function SlideArt({ kind }: { kind: ArtKind }) {
  return (
    <svg viewBox="0 0 48 48" width="64" height="64" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
      {kind === 'phone' && (
        <g>
          <rect x="14" y="5" width="20" height="38" rx="4" />
          <path d="M21 37h6" />
          <path d="m19.5 22 3 3 6-6" />
        </g>
      )}
      {kind === 'receipt' && (
        <g>
          <path d="M12 6h24v36l-4-3-4 3-4-3-4 3-4-3-4 3Z" />
          <path d="M17 15h14M17 22h14M17 29h8" />
        </g>
      )}
      {kind === 'bubble' && (
        <g>
          <path d="M8 10h32v20H23l-8 7v-7H8Z" />
          <circle cx="17" cy="20" r="1.6" fill="currentColor" />
          <circle cx="24" cy="20" r="1.6" fill="currentColor" />
          <circle cx="31" cy="20" r="1.6" fill="currentColor" />
        </g>
      )}
      {kind === 'badge' && (
        <g>
          <circle cx="24" cy="20" r="11" />
          <path d="M17 29 15 43l9-4 9 4-2-14" />
          <path d="m19.5 20 3 3 6-6" />
        </g>
      )}
      {kind === 'dashboard' && (
        <g>
          <rect x="6" y="8" width="36" height="32" rx="4" />
          <path d="M14 33v-7M22 33v-12M30 33v-9" />
        </g>
      )}
      {kind === 'flag' && (
        <g>
          <path d="M12 42V7" />
          <path d="M12 8h22l-4 6 4 6H12" />
        </g>
      )}
      {kind === 'pulse' && <path d="M5 26h9l4-9 5 16 4-11 3 4h13" />}
      {kind === 'qr' && (
        <g>
          <rect x="7" y="7" width="15" height="15" rx="2" />
          <rect x="26" y="7" width="15" height="15" rx="2" />
          <rect x="7" y="26" width="15" height="15" rx="2" />
          <path d="M27 27h4v4h-4zM35 27h6M27 35v6M35 35h2v6" />
        </g>
      )}
    </svg>
  );
}

interface StepProps {
  flow: OnboardingFlow;
  copy: Copy;
}

/** Hello screen: a greeting that cycles through the languages. Tapping it opens the language step. */
export function HelloStep({ flow }: { flow: OnboardingFlow }) {
  return (
    <div class="ob-hello">
      <h1 id={TITLE_ID} class="ob-sr-only">
        {HELLO_LABEL}
      </h1>
      <span id={TAP_ID} class="ob-sr-only">
        {TAP_LABEL}
      </span>
      <button
        type="button"
        class="ob-hit"
        data-autofocus=""
        aria-labelledby={`${TITLE_ID} ${TAP_ID}`}
        onClick={() => flow.setStep('language')}
      >
        <span class={`ob-greet-stack${flow.reduce ? ' is-static' : ''}`} aria-hidden="true">
          {ORDER.map((l, i) => (
            <span
              key={l}
              lang={l}
              class={`ob-greet-item${i === flow.greet ? ' is-in' : i === flow.greetPrev ? ' is-out' : ''}`}
            >
              {/* The word writes itself: an ink outline traces each glyph, then it fills in. SVG text
                  follows the real font outlines, so Devanagari and Tamil draw correctly too. */}
              <svg
                class="ob-greet"
                focusable="false"
                {...(l === 'en' ? { viewBox: HELLO_VIEWBOX, preserveAspectRatio: 'xMidYMid meet' } : {})}
              >
                <defs>
                  <linearGradient id={`ob-ink-${l}`} x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" class="ob-ink-a" />
                    <stop offset="55%" class="ob-ink-b" />
                    <stop offset="100%" class="ob-ink-c" />
                  </linearGradient>
                </defs>
                {l === 'en' ? (
                  // English uses a pre-merged outline (Inter's own "e" has overlapping contours that
                  // tracing would show). pathLength matches the dash length the CSS animates.
                  <path d={HELLO_PATH} pathLength={900} stroke={`url(#ob-ink-${l})`} />
                ) : (
                  <text x="50%" y="55%" text-anchor="middle" dominant-baseline="middle" stroke={`url(#ob-ink-${l})`}>
                    {COPY[l].greeting}
                  </text>
                )}
              </svg>
              <span class="ob-tap">{COPY[l].tap}</span>
            </span>
          ))}
        </span>
      </button>
    </div>
  );
}

/** Language picker: one card per language, each with a button that reads the name aloud. */
export function LanguageStep({ flow }: { flow: OnboardingFlow }) {
  const [headingLanguage] = useState(getLang);
  const language = flow.picked ?? getLang();
  return (
    <form class="ob-lang language-panel" onSubmit={(event) => { event.preventDefault(); flow.confirmLanguage(); }}>
      <div class="ob-language-heading">
        <h1 id={TITLE_ID} lang={headingLanguage}>{tIn(headingLanguage, 'language.title')}</h1>
        <LanguageHints language={headingLanguage} />
      </div>
      <LanguageChoices value={language} onChange={flow.choose} name="onboarding-language" />
      <button type="submit" class="btn btn-primary ob-language-continue" lang={language}>
        <span>{tIn(language, 'language.continue')}</span><Icon name="chevron" size={20} />
      </button>
      <p class="language-later" lang={language}>{tIn(language, 'language.later')}</p>
    </form>
  );
}

interface SlidesStepProps extends StepProps {
  uiLang: Language;
  role: Role;
  slides: Slides;
}

/** The role's slides with dots, swipe support and Back / Listen / Next actions. */
export function SlidesStep({ flow, copy, uiLang, role, slides }: SlidesStepProps) {
  const { index } = flow;
  const slide = slides[index] ?? slides[0];
  const artKind: ArtKind = ART[role][index] ?? ART[role][0];
  const stepOf = copy.stepOf.replace('{n}', String(index + 1)).replace('{total}', String(slides.length));

  return (
    <div
      class="ob-slides"
      onPointerDown={flow.swipe.onPointerDown}
      onPointerUp={flow.swipe.onPointerUp}
      onPointerCancel={flow.swipe.onPointerCancel}
    >
      <div class="ob-slide-viewport">
        <div key={`${role}-${index}`} lang={uiLang} class={`ob-slide${flow.dir === -1 ? ' from-left' : ''}`}>
          <div class="ob-art">
            <SlideArt kind={artKind} />
          </div>
          <h1 id={TITLE_ID} class="ob-slide-title">
            {slide.title}
          </h1>
          <p class="ob-slide-body">{slide.body}</p>
        </div>
      </div>

      <div class="ob-dots" role="img" aria-label={stepOf}>
        {slides.map((_, i) => (
          <span key={i} class={`ob-dot${i === index ? ' is-on' : ''}`} />
        ))}
      </div>

      <div class="ob-actions">
        {flow.canBack && (
          <button type="button" class="ob-btn ob-btn-quiet" onClick={flow.back}>
            {copy.back}
          </button>
        )}
        <button type="button" class="ob-btn ob-btn-quiet" onClick={() => speak(`${slide.title}. ${slide.body}`, uiLang)}>
          {copy.listen}
        </button>
        <button type="button" class="ob-btn ob-btn-primary" data-autofocus="" onClick={flow.primary}>
          {index < slides.length - 1 ? copy.next : copy.start}
        </button>
      </div>
    </div>
  );
}
