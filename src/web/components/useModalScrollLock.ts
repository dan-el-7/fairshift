import { useLayoutEffect } from 'preact/hooks';

/** Modal content owns scrolling; the page behind it keeps its position. */
export function useModalScrollLock(): void {
  useLayoutEffect(() => {
    const root = document.documentElement, body = document.body;
    const rootOverflow = root.style.overflow, bodyOverflow = body.style.overflow;
    root.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    return () => {
      root.style.overflow = rootOverflow;
      body.style.overflow = bodyOverflow;
    };
  }, []);
}
