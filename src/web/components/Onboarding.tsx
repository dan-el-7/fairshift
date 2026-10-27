import { useEffect, useRef, useState } from 'preact/hooks';
import type { Language, Role } from '../../shared/types';
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

const introKey = (role: Role) => `fairshift.intro.${role}`;

/** True when this role's intro slides were finished or skipped on this device. False when storage is blocked. */
export function hasSeenIntro(role: Role): boolean {
  try {
    return window.localStorage.getItem(introKey(role)) === '1';
  } catch {
    return false;
  }
}

/** Records that a role's intro is done. Never throws. */
export function markIntroSeen(role: Role): void {
  try {
    window.localStorage.setItem(introKey(role), '1');
  } catch {
    // Storage blocked. The intro may show again; nothing else to do.
  }
}

interface Slide {
  title: string;
  body: string;
}

type Slides = [Slide, Slide, Slide, Slide];

interface Copy {
  greeting: string;
  tap: string;
  chooseTitle: string;
  roles: Record<Role, Slides>;
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
    roles: {
      worker: [
        { title: 'Check in with one tap', body: 'Scan the site QR or use your location. Your hours and overtime are counted for you.' },
        { title: 'Your pay, explained', body: 'Every line shows the maths. Listen to it in your language.' },
        { title: 'Speak up safely', body: 'Report by voice or text and get a case code. Nobody can see who you are.' },
        { title: 'Your skills go with you', body: 'A verified record that any employer can check.' },
      ],
      admin: [
        { title: 'Your site at a glance', body: 'Attendance, overtime and alerts on one dashboard.' },
        { title: 'Act on reports fast', body: 'Sorted by severity, overdue ones first. Update the reporter by case code.' },
        { title: 'Spot burnout early', body: 'Fatigue alerts and quit-risk, each with clear reasons. Anonymous reports are never used.' },
        { title: 'QR kiosk check-in', body: "Show a rotating QR at the gate. It can't be screenshotted and reused." },
      ],
    },
    next: 'Next',
    back: 'Back',
    skip: 'Skip',
    start: "Let's go",
    listen: 'Listen',
    stepOf: 'Step {n} of {total}',
  },
  hi: {
    greeting: 'नमस्ते',
    tap: 'शुरू करने के लिए टैप करें',
    chooseTitle: 'अपनी भाषा चुनें',
    roles: {
      worker: [
        { title: 'एक टैप में हाज़िरी लगाएँ', body: 'साइट का QR स्कैन करें या अपनी लोकेशन इस्तेमाल करें। आपके घंटे और ओवरटाइम अपने-आप गिने जाते हैं।' },
        { title: 'आपकी मज़दूरी, साफ़ समझाई गई', body: 'हर लाइन में हिसाब दिखता है। अपनी भाषा में सुनें।' },
        { title: 'बेखौफ़ होकर बोलें', body: 'आवाज़ या लिखकर रिपोर्ट करें और केस कोड पाएँ। कोई नहीं देख सकता कि आप कौन हैं।' },
        { title: 'आपका हुनर आपके साथ चलता है', body: 'एक सत्यापित रिकॉर्ड, जिसे कोई भी नियोक्ता जाँच सकता है।' },
      ],
      admin: [
        { title: 'आपकी साइट एक नज़र में', body: 'हाज़िरी, ओवरटाइम और अलर्ट एक ही डैशबोर्ड पर।' },
        { title: 'रिपोर्ट पर तुरंत कार्रवाई', body: 'गंभीरता के हिसाब से छँटी हुई, पुरानी पेंडिंग पहले। केस कोड से रिपोर्टर को अपडेट करें।' },
        { title: 'थकान के संकेत जल्दी पहचानें', body: 'थकान और नौकरी छोड़ने के जोखिम के अलर्ट, साफ़ कारणों के साथ। गुमनाम रिपोर्ट कभी इस्तेमाल नहीं होतीं।' },
        { title: 'QR किऑस्क से हाज़िरी', body: 'गेट पर घूमता हुआ QR दिखाएँ। इसका स्क्रीनशॉट लेकर दोबारा इस्तेमाल नहीं हो सकता।' },
      ],
    },
    next: 'अगला',
    back: 'पीछे',
    skip: 'छोड़ें',
    start: 'चलिए',
    listen: 'सुनें',
    stepOf: 'चरण {n} / {total}',
  },
  ta: {
    greeting: 'வணக்கம்',
    tap: 'தொடங்க தட்டவும்',
    chooseTitle: 'உங்கள் மொழியைத் தேர்ந்தெடுக்கவும்',
    roles: {
      worker: [
        { title: 'ஒரே தட்டலில் வருகை பதிவு', body: 'தள QR-ஐ ஸ்கேன் செய்யுங்கள் அல்லது இருப்பிடத்தைப் பயன்படுத்துங்கள். உங்கள் நேரமும் கூடுதல் நேரமும் உங்களுக்காகக் கணக்கிடப்படும்.' },
        { title: 'உங்கள் ஊதியம், தெளிவாக', body: 'ஒவ்வொரு வரியிலும் கணக்கு காட்டப்படும். உங்கள் மொழியில் கேட்கலாம்.' },
        { title: 'பாதுகாப்பாகக் குரல் கொடுங்கள்', body: 'குரல் அல்லது எழுத்து மூலம் புகார் தெரிவித்து வழக்குக் குறியீட்டைப் பெறுங்கள். நீங்கள் யார் என்பது யாருக்கும் தெரியாது.' },
        { title: 'உங்கள் திறன்கள் உங்களுடன் வரும்', body: 'எந்த முதலாளியும் சரிபார்க்கக்கூடிய உறுதிசெய்யப்பட்ட பதிவு.' },
      ],
      admin: [
        { title: 'உங்கள் தளம், ஒரு பார்வையில்', body: 'வருகை, கூடுதல் நேரம் மற்றும் எச்சரிக்கைகள் ஒரே டாஷ்போர்டில்.' },
        { title: 'புகார்களுக்கு விரைவாகச் செயல்படுங்கள்', body: 'தீவிரத்தின்படி வரிசைப்படுத்தப்படும்; தாமதமானவை முதலில். வழக்குக் குறியீட்டின் மூலம் புகார்தாரருக்குத் தெரிவியுங்கள்.' },
        { title: 'சோர்வை முன்கூட்டியே கண்டறியுங்கள்', body: 'சோர்வு மற்றும் வேலை விட்டுப் போகும் அபாய எச்சரிக்கைகள், தெளிவான காரணங்களுடன். அநாமதேய புகார்கள் ஒருபோதும் பயன்படுத்தப்படாது.' },
        { title: 'QR கியோஸ்க் வருகைப் பதிவு', body: 'வாயிலில் சுழலும் QR-ஐக் காட்டுங்கள். இதை ஸ்கிரீன்ஷாட் எடுத்து மீண்டும் பயன்படுத்த முடியாது.' },
      ],
    },
    next: 'அடுத்து',
    back: 'பின்',
    skip: 'தவிர்',
    start: 'வாருங்கள்',
    listen: 'கேளுங்கள்',
    stepOf: 'படி {n} / {total}',
  },
};

type ArtKind = 'phone' | 'receipt' | 'bubble' | 'badge' | 'dashboard' | 'flag' | 'pulse' | 'qr';

/** Illustration for each slide, in order. */
const ART: Record<Role, [ArtKind, ArtKind, ArtKind, ArtKind]> = {
  worker: ['phone', 'receipt', 'bubble', 'badge'],
  admin: ['dashboard', 'flag', 'pulse', 'qr'],
};

/** Order in which the hello greetings cycle. */
const ORDER: Language[] = ['en', 'hi', 'ta'];
const SUBTITLE: Record<Language, string | null> = { en: null, hi: 'Hindi', ta: 'Tamil' };
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

/**
 * first: Hello, language, then close (first visit, no slides).
 * replay: Hello, language, then the role's slides when a role is given (#/welcome).
 * intro: the role's slides only, starting at the first slide (after login).
 */
export type OnboardingMode = 'first' | 'replay' | 'intro';

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

export interface OnboardingProps {
  onDone: () => void;
  mode?: OnboardingMode;
  /** Required for intro; optional for replay, where it adds the role's slides. */
  role?: Role | null;
}

/**
 * Onboarding overlay. Mount it for the mode that applies; onDone runs after the exit animation
 * (or at once with reduced motion). See OnboardingMode for each flow.
 */
export function Onboarding({ onDone, mode = 'first', role = null }: OnboardingProps) {
  const uiLang = useLang();
  const copy = COPY[uiLang];
  const slideRole: Role | null = mode === 'first' ? null : role;
  const slides: Slides | null = slideRole ? copy.roles[slideRole] : null;
  const slideCount = slides ? slides.length : 0;
  const [reduce] = useState<boolean>(prefersReducedMotion);
  const [step, setStep] = useState<Step>(mode === 'intro' && slideRole ? 'slides' : 'hello');
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

  const later = (fn: () => void, ms: number) => {
    timersRef.current.push(window.setTimeout(fn, ms));
  };

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  /** Every way out (Skip, Esc, Let's go, or the end of the flow) records onboarding and any role intro, then fades out. */
  const complete = () => {
    if (exitingRef.current) return;
    exitingRef.current = true;
    markOnboarded();
    if (slideRole) markIntroSeen(slideRole);
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
      busyRef.current = false;
      if (slideRole) {
        setDir(1);
        setIndex(0);
        setStep('slides');
      } else {
        complete();
      }
    }, CHOOSE_MS);
  };

  const goNext = () => {
    if (index < slideCount - 1) {
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
  const primary = () => (index < slideCount - 1 ? goNext() : complete());
  // The intro has no language step, so Back is hidden on its first slide.
  const canBack = index > 0 || mode !== 'intro';
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

  const stepOf = copy.stepOf.replace('{n}', String(index + 1)).replace('{total}', String(slideCount));
  const slide: Slide | undefined = slides ? slides[index] ?? slides[0] : undefined;
  const artKind: ArtKind | undefined = slideRole ? ART[slideRole][index] ?? ART[slideRole][0] : undefined;

  return (
    <div
      ref={dialogRef}
      class={`ob-root${exiting ? ' is-exiting' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={TITLE_ID}
      onPointerDown={() => {
        armedRef.current = true;
      }}
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

        {step === 'slides' && slides && slide && (
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
              <div key={`${slideRole}-${index}`} lang={uiLang} class={`ob-slide${dir === -1 ? ' from-left' : ''}`}>
                <div class="ob-art">{artKind && <SlideArt kind={artKind} />}</div>
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
              {canBack && (
                <button type="button" class="ob-btn ob-btn-quiet" onClick={back}>
                  {copy.back}
                </button>
              )}
              <button type="button" class="ob-btn ob-btn-quiet" onClick={() => speak(`${slide.title}. ${slide.body}`, uiLang)}>
                {copy.listen}
              </button>
              <button type="button" class="ob-btn ob-btn-primary" data-autofocus="" onClick={primary}>
                {index < slideCount - 1 ? copy.next : copy.start}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
