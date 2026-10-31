import { useEffect, useRef, useState } from 'preact/hooks';
import type { Language, Role } from '../../../shared/types';
import { getLang, setLang } from '../../i18n';
import { hasExplicitChoice } from '../../langDetect';
import { EXIT_MS, FOCUSABLE, GREET_MS, ORDER, SWIPE_PX } from './content';
import { markIntroSeen, markOnboarded } from './storage';

/**
 * first: Hello, language, then close (first visit, no slides).
 * replay: Hello, language, then the role's slides when a role is given (#/welcome).
 * intro: the role's slides only, starting at the first slide (after login).
 */
export type OnboardingMode = 'first' | 'replay' | 'intro';

type Step = 'hello' | 'language' | 'slides';

interface FlowOptions {
  mode: OnboardingMode;
  slideRole: Role | null;
  slideCount: number;
  /** Intro only: run the full flow (hello, language, then the role's slides) instead of slides alone. */
  openWithHello: boolean;
  onDone: () => void;
}

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

/** Keeps a window keydown listener on the latest handler, so it never reads stale state. */
function useWindowKeydown(handler: (event: KeyboardEvent) => void): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const listener = (event: KeyboardEvent) => ref.current(event);
    // Captured once, so a cleanup that runs after teardown never looks up a missing global window.
    const win = window;
    win.addEventListener('keydown', listener);
    return () => win.removeEventListener('keydown', listener);
  }, []);
}

/** Greeting cycle. Only the outgoing and incoming greetings animate; reduced motion shows all three statically. */
function useGreeting(reduce: boolean, step: Step) {
  const initial = ORDER.indexOf(getLang());
  const [greet, setGreet] = useState(initial);
  const [greetPrev, setGreetPrev] = useState<number | null>(null);
  const greetRef = useRef(initial);
  useEffect(() => {
    if (reduce || step !== 'hello') return undefined;
    const id = setInterval(() => {
      const prev = greetRef.current;
      const next = (prev + 1) % ORDER.length;
      greetRef.current = next;
      setGreetPrev(prev);
      setGreet(next);
    }, GREET_MS);
    return () => clearInterval(id);
  }, [reduce, step]);
  return { greet, greetPrev };
}

/** Horizontal swipe on the slides moves to the next or previous slide. */
function useSwipe(onNext: () => void, onPrev: () => void) {
  const startRef = useRef<number | null>(null);
  return {
    onPointerDown: (event: PointerEvent) => {
      startRef.current = event.clientX;
    },
    onPointerUp: (event: PointerEvent) => {
      const start = startRef.current;
      startRef.current = null;
      if (start === null) return;
      const dx = event.clientX - start;
      if (dx <= -SWIPE_PX) onNext();
      else if (dx >= SWIPE_PX) onPrev();
    },
    onPointerCancel: () => {
      startRef.current = null;
    },
  };
}

/** All state and actions for the onboarding overlay. The step components only render from this. */
export function useOnboardingFlow({ mode, slideRole, slideCount, openWithHello, onDone }: FlowOptions) {
  const [reduce] = useState<boolean>(prefersReducedMotion);
  const [step, setStep] = useState<Step>(mode === 'intro' && slideRole && !openWithHello ? 'slides' : 'hello');
  const [picked, setPicked] = useState<Language | null>(() => hasExplicitChoice() ? getLang() : navigatorLanguage());
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [exiting, setExiting] = useState(false);
  const { greet, greetPrev } = useGreeting(reduce, step);

  const dialogRef = useRef<HTMLDivElement>(null);
  const exitingRef = useRef(false);
  const timersRef = useRef<number[]>([]);

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
    if (exitingRef.current) return;
    setPicked(lang);
  };
  const confirmLanguage = () => {
    if (exitingRef.current) return;
    setLang(picked ?? getLang());
    if (slideRole) {
      setDir(1);
      setIndex(0);
      setStep('slides');
    } else complete();
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
  // A slides-only intro has no language step, so Back is hidden on its first slide.
  const canBack = index > 0 || mode !== 'intro' || openWithHello;
  const back = () => (index > 0 ? goPrev() : setStep('language'));
  const swipe = useSwipe(goNext, goPrev);

  // Keyboard handling sits on the window so it works wherever focus is.
  useWindowKeydown((event: KeyboardEvent) => {
    if (exitingRef.current) return;
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
  });

  // Focus moves to the first actionable element of each step (marked data-autofocus).
  useEffect(() => {
    if (exitingRef.current) return;
    // Move focus for screen readers without painting the keyboard ring for people who tapped;
    // the ring still appears as soon as someone presses Tab. (focusVisible is not in TS's DOM types yet.)
    dialogRef.current
      ?.querySelector<HTMLElement>('[data-autofocus]')
      ?.focus({ preventScroll: true, focusVisible: false });
  }, [step, index]);

  return {
    reduce,
    step,
    setStep,
    picked,
    index,
    dir,
    greet,
    greetPrev,
    exiting,
    dialogRef,
    complete,
    choose,
    confirmLanguage,
    primary,
    back,
    canBack,
    swipe,
  };
}

export type OnboardingFlow = ReturnType<typeof useOnboardingFlow>;
