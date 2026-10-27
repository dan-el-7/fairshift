import { useEffect, useRef, useState } from 'preact/hooks';
import type { Language } from '../../shared/types';
import { LANGUAGE_LABEL, setLang, useLang } from '../i18n';
import { speak } from '../speech';
import '../onboarding.css';

const STORAGE_KEY = 'fairshift.onboarded';

/** True when the first-run flow has been finished or skipped on this device. False when storage is blocked. */
export function hasOnboarded(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Records that the first-run flow is done. Never throws: with blocked storage the flow simply shows again. */
export function markOnboarded(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // Storage blocked. Nothing else to do.
  }
}

interface Slide {
  title: string;
  body: string;
}

interface Copy {
  greeting: string;
  tap: string;
  chooseTitle: string;
  slides: [Slide, Slide, Slide];
  next: string;
  back: string;
  skip: string;
  start: string;
  listen: string;
  /** Contains {n} and {total}. */
  stepOf: string;
}

/** Strings for the onboarding flow. All three languages live here, so the flow works before a language is chosen. */
const COPY: Record<Language, Copy> = {
  en: {
    greeting: 'Hello',
    tap: 'Tap to begin',
    chooseTitle: 'Choose your language',
    slides: [
      { title: 'Fair pay you can see', body: 'Every rupee is explained, and overtime is counted automatically.' },
      { title: 'Speak up safely', body: 'Report a problem by voice or text. Nobody can see who you are.' },
      { title: 'Your skills travel with you', body: 'Get a verified record that any employer can check.' },
    ],
    next: 'Next',
    back: 'Back',
    skip: 'Skip',
    start: 'Get started',
    listen: 'Listen',
    stepOf: 'Step {n} of {total}',
  },
  hi: {
    greeting: 'नमस्ते',
    tap: 'शुरू करने के लिए टैप करें',
    chooseTitle: 'अपनी भाषा चुनें',
    slides: [
      { title: 'उचित मज़दूरी, साफ़ हिसाब', body: 'हर रुपये का हिसाब दिखता है, और ओवरटाइम अपने-आप गिना जाता है।' },
      { title: 'बेखौफ़ होकर बोलें', body: 'आवाज़ या लिखकर समस्या बताएँ। कोई नहीं देख सकता कि आप कौन हैं।' },
      { title: 'आपका हुनर आपके साथ चलता है', body: 'एक सत्यापित रिकॉर्ड पाएँ, जिसे कोई भी नियोक्ता जाँच सकता है।' },
    ],
    next: 'अगला',
    back: 'पीछे',
    skip: 'छोड़ें',
    start: 'शुरू करें',
    listen: 'सुनें',
    stepOf: 'चरण {n} / {total}',
  },
  ta: {
    greeting: 'வணக்கம்',
    tap: 'தொடங்க தட்டவும்',
    chooseTitle: 'உங்கள் மொழியைத் தேர்ந்தெடுக்கவும்',
    slides: [
      { title: 'நியாயமான ஊதியம், தெளிவான கணக்கு', body: 'ஒவ்வொரு ரூபாயின் கணக்கும் விளக்கப்படும்; கூடுதல் நேரம் தானாகக் கணக்கிடப்படும்.' },
      { title: 'பாதுகாப்பாகக் குரல் கொடுங்கள்', body: 'குரல் அல்லது எழுத்து மூலம் பிரச்சினையைத் தெரிவியுங்கள். நீங்கள் யார் என்பது யாருக்கும் தெரியாது.' },
      { title: 'உங்கள் திறன்கள் உங்களுடன் வரும்', body: 'எந்த முதலாளியும் சரிபார்க்கக்கூடிய உறுதிசெய்யப்பட்ட பதிவு கிடைக்கும்.' },
    ],
    next: 'அடுத்து',
    back: 'பின்',
    skip: 'தவிர்',
    start: 'தொடங்கு',
    listen: 'கேளுங்கள்',
    stepOf: 'படி {n} / {total}',
  },
};

/** Order in which the hello greetings cycle. */
const ORDER: Language[] = ['en', 'hi', 'ta'];
const SUBTITLE: Record<Language, string | null> = { en: null, hi: 'Hindi', ta: 'Tamil' };
const SLIDE_COUNT = 3;
const SWIPE_PX = 50;
const GREET_MS = 2200;
const CHOOSE_MS = 450;
const EXIT_MS = 300;
const TITLE_ID = 'ob-title';
const TAP_ID = 'ob-tap-label';
const HELLO_LABEL = ORDER.map((l) => COPY[l].greeting).join(' · ');
const TAP_LABEL = ORDER.map((l) => COPY[l].tap).join(' · ');
const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type Step = 'hello' | 'language' | 'slides';

function prefersReducedMotion(): boolean {
  try {
    return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Pre-highlight card for hi or ta browsers. English is not pre-highlighted. */
function navigatorLanguage(): Language | null {
  try {
    const tag = (navigator.language || '').toLowerCase();
    if (tag.startsWith('hi')) return 'hi';
    if (tag.startsWith('ta')) return 'ta';
  } catch {
    // No navigator language available.
  }
  return null;
}

function trapFocus(event: KeyboardEvent, root: HTMLElement | null): void {
  if (!root) return;
  const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
  const first = items[0];
  const last = items[items.length - 1];
  if (!first || !last) return;
  const active = document.activeElement;
  const inside = active instanceof Node && root.contains(active);
  if (event.shiftKey) {
    if (!inside || active === first) {
      event.preventDefault();
      last.focus();
    }
  } else if (!inside || active === last) {
    event.preventDefault();
    first.focus();
  }
}

function SpeakerIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
      <path d="M11 5 6 9H3v6h3l5 4z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  );
}

/** Line illustrations for the three slides: wallet, shield with sound waves, badge with check. */
function SlideArt({ n }: { n: number }) {
  return (
    <svg viewBox="0 0 48 48" width="64" height="64" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
      {n === 0 && (
        <g>
          <rect x="6" y="13" width="34" height="25" rx="5" />
          <path d="M6 22h34" />
          <circle cx="33" cy="28" r="2.2" />
        </g>
      )}
      {n === 1 && (
        <g>
          <path d="M20 6 32 10.5V21c0 10-5 16-12 19-7-3-12-9-12-19V10.5Z" />
          <path d="M37 18q2.5 3.5 0 7" />
          <path d="M41 15q4.5 6.5 0 13" />
        </g>
      )}
      {n === 2 && (
        <g>
          <circle cx="24" cy="20" r="11" />
          <path d="M17 29 15 43l9-4 9 4-2-14" />
          <path d="m19.5 20 3 3 6-6" />
        </g>
      )}
    </svg>
  );
}

/**
 * First-run onboarding: a "Hello" greeting, a language choice, then three short slides.
 * Mount it when hasOnboarded() is false. onDone runs after the exit animation (or at once with reduced motion).
 */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const uiLang = useLang();
  const copy = COPY[uiLang];
  const [reduce] = useState<boolean>(prefersReducedMotion);
  const [step, setStep] = useState<Step>('hello');
  const [picked, setPicked] = useState<Language | null>(navigatorLanguage);
  const [pressed, setPressed] = useState<Language | null>(null);
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [greet, setGreet] = useState(0);
  const [greetPrev, setGreetPrev] = useState<number | null>(null);
  const [exiting, setExiting] = useState(false);

  const dialogRef = useRef<HTMLDivElement>(null);
  const greetRef = useRef(0);
  const armedRef = useRef(false);
  const busyRef = useRef(false);
  const exitingRef = useRef(false);
  const timersRef = useRef<number[]>([]);
  const swipeRef = useRef<number | null>(null);
  const keyRef = useRef<(event: KeyboardEvent) => void>(() => undefined);

  const slideLang: Language = picked ?? 'en';
  const slideCopy = COPY[slideLang];

  const later = (fn: () => void, ms: number) => {
    timersRef.current.push(window.setTimeout(fn, ms));
  };

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  /** Every way out (Skip, Esc, Get started) records onboarding, then fades out before onDone. */
  const complete = () => {
    if (exitingRef.current) return;
    exitingRef.current = true;
    markOnboarded();
    setExiting(true);
    later(() => onDone(), reduce ? 0 : EXIT_MS);
  };

  const choose = (lang: Language) => {
    if (busyRef.current || exitingRef.current) return;
    busyRef.current = true;
    setLang(lang);
    setPicked(lang);
    setPressed(lang);
    later(() => {
      setPressed(null);
      setDir(1);
      setIndex(0);
      setStep('slides');
      busyRef.current = false;
    }, CHOOSE_MS);
  };

  const goNext = () => {
    if (index < SLIDE_COUNT - 1) {
      setDir(1);
      setIndex(index + 1);
    }
  };
  const goPrev = () => {
    if (index > 0) {
      setDir(-1);
      setIndex(index - 1);
    }
  };
  const primary = () => (index < SLIDE_COUNT - 1 ? goNext() : complete());
  const back = () => (index > 0 ? goPrev() : setStep('language'));

  // Keyboard handling sits on the window so it works wherever focus is. The ref keeps it on the latest render.
  keyRef.current = (event: KeyboardEvent) => {
    if (exitingRef.current) return;
    armedRef.current = true;
    if (event.key === 'Escape') {
      event.preventDefault();
      complete();
      return;
    }
    if (event.key === 'Tab') {
      trapFocus(event, dialogRef.current);
      return;
    }
    if (step === 'slides' && event.key === 'ArrowRight') {
      event.preventDefault();
      goNext();
    } else if (step === 'slides' && event.key === 'ArrowLeft') {
      event.preventDefault();
      goPrev();
    }
  };

  useEffect(() => {
    const listener = (event: KeyboardEvent) => keyRef.current(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  // Greeting cycle. Only the outgoing and incoming greetings animate; reduced motion shows all three statically.
  useEffect(() => {
    if (reduce || step !== 'hello') return undefined;
    const id = window.setInterval(() => {
      const prev = greetRef.current;
      const next = (prev + 1) % ORDER.length;
      greetRef.current = next;
      setGreetPrev(prev);
      setGreet(next);
    }, GREET_MS);
    return () => window.clearInterval(id);
  }, [reduce, step]);

  // Focus moves to the first actionable element of each step (marked data-autofocus).
  useEffect(() => {
    if (exitingRef.current) return;
    dialogRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
  }, [step, index]);

  const stepOf = slideCopy.stepOf.replace('{n}', String(index + 1)).replace('{total}', String(SLIDE_COUNT));
  const slide: Slide = slideCopy.slides[index] ?? slideCopy.slides[0];
  const arm = () => {
    armedRef.current = true;
  };

  return (
    <div
      ref={dialogRef}
      class={`ob-root${exiting ? ' is-exiting' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={TITLE_ID}
      onPointerDown={arm}
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
          <button type="button" class="ob-btn ob-btn-quiet" onClick={complete}>
            {copy.skip}
          </button>
        </div>

        {step === 'hello' && (
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
              onClick={() => setStep('language')}
            >
              <span class={`ob-greet-stack${reduce ? ' is-static' : ''}`} aria-hidden="true">
                {ORDER.map((l, i) => (
                  <span
                    key={l}
                    lang={l}
                    class={`ob-greet-item${i === greet ? ' is-in' : i === greetPrev ? ' is-out' : ''}`}
                  >
                    <span class="ob-greet">{COPY[l].greeting}</span>
                    <span class="ob-tap">{COPY[l].tap}</span>
                  </span>
                ))}
              </span>
            </button>
          </div>
        )}

        {step === 'language' && (
          <div class="ob-lang">
            <h1 id={TITLE_ID} class="ob-lang-title">
              {ORDER.map((l) => (
                <span key={l} lang={l} class="ob-title-line">
                  {COPY[l].chooseTitle}
                </span>
              ))}
            </h1>
            <div class="ob-cards">
              {ORDER.map((l) => (
                <div
                  key={l}
                  class={`ob-card${picked === l ? ' is-selected' : ''}${pressed === l ? ' is-pressed' : ''}`}
                >
                  <button
                    type="button"
                    class="ob-card-main"
                    lang={l}
                    data-autofocus={(picked ?? 'en') === l ? '' : undefined}
                    onClick={() => choose(l)}
                    onMouseEnter={() => speak(LANGUAGE_LABEL[l], l)}
                    onFocus={() => {
                      if (armedRef.current) speak(LANGUAGE_LABEL[l], l);
                    }}
                  >
                    <span class="ob-card-name">{LANGUAGE_LABEL[l]}</span>
                    {SUBTITLE[l] && <span class="ob-card-sub">{SUBTITLE[l]}</span>}
                  </button>
                  <button
                    type="button"
                    class="ob-card-speak"
                    aria-label={`${copy.listen}: ${LANGUAGE_LABEL[l]}`}
                    onClick={() => speak(LANGUAGE_LABEL[l], l)}
                  >
                    <SpeakerIcon />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 'slides' && (
          <div
            class="ob-slides"
            onPointerDown={(e) => {
              swipeRef.current = e.clientX;
            }}
            onPointerUp={(e) => {
              const start = swipeRef.current;
              swipeRef.current = null;
              if (start === null) return;
              const dx = e.clientX - start;
              if (dx <= -SWIPE_PX) goNext();
              else if (dx >= SWIPE_PX) goPrev();
            }}
            onPointerCancel={() => {
              swipeRef.current = null;
            }}
          >
            <div class="ob-slide-viewport">
              <div key={index} lang={slideLang} class={`ob-slide${dir === -1 ? ' from-left' : ''}`}>
                <div class="ob-art">
                  <SlideArt n={index} />
                </div>
                <h1 id={TITLE_ID} class="ob-slide-title">
                  {slide.title}
                </h1>
                <p class="ob-slide-body">{slide.body}</p>
              </div>
            </div>

            <div class="ob-dots" role="img" aria-label={stepOf}>
              {[0, 1, 2].map((i) => (
                <span key={i} class={`ob-dot${i === index ? ' is-on' : ''}`} />
              ))}
            </div>

            <div class="ob-actions">
              <button type="button" class="ob-btn ob-btn-quiet" onClick={back}>
                {slideCopy.back}
              </button>
              <button
                type="button"
                class="ob-btn ob-btn-quiet"
                onClick={() => speak(`${slide.title}. ${slide.body}`, slideLang)}
              >
                {slideCopy.listen}
              </button>
              <button type="button" class="ob-btn ob-btn-primary" data-autofocus="" onClick={primary}>
                {index < SLIDE_COUNT - 1 ? slideCopy.next : slideCopy.start}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
