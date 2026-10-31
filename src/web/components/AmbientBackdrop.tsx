import { useEffect, useRef, useState } from 'preact/hooks';
import { renderAmbientField, type AmbientColor } from '../ambientField';

const FALLBACK: AmbientColor[] = [[67, 56, 202], [124, 58, 237], [37, 99, 235], [190, 24, 93]];

/** Low-resolution fluid light; the original CSS backdrop remains the no-motion/unsupported fallback. */
export function AmbientBackdrop({ kind = 'app', active = true }: { kind?: 'app' | 'onboarding'; active?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(false);
    if (!active || typeof CanvasRenderingContext2D === 'undefined' || typeof window.matchMedia !== 'function') return;
    const canvas = ref.current, context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const surface = canvas, ctx = context;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const scheme = window.matchMedia('(prefers-color-scheme: dark)');
    let frame = 0, previous = 0, lastPaint = 0, seconds = 37.5;
    let pixels: ImageData;
    let colors = FALLBACK;
    function readColors() {
      const style = getComputedStyle(document.documentElement);
      colors = ['a', 'b', 'c', 'd'].map((key, i): AmbientColor => {
        const hex = /^#([\da-f]{6})$/i.exec(style.getPropertyValue(`--blob-${key}`).trim())?.[1];
        return hex ? [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)] : FALLBACK[i] ?? [0, 0, 0];
      });
    }
    function paint() {
      renderAmbientField(pixels.data, pixels.width, pixels.height, seconds, colors);
      ctx.putImageData(pixels, 0, 0);
    }
    function resize() {
      const scale = 192 / Math.max(window.innerWidth, window.innerHeight, 1);
      surface.width = Math.max(1, Math.round(window.innerWidth * scale));
      surface.height = Math.max(1, Math.round(window.innerHeight * scale));
      pixels = ctx.createImageData(surface.width, surface.height);
      paint();
    }
    function tick(now: number) {
      if (previous) seconds += Math.min((now - previous) / 1000, .15) * 1.7;
      previous = now;
      if (now - lastPaint >= 45) { paint(); lastPaint = now; }
      frame = requestAnimationFrame(tick);
    }
    function syncMotion() {
      cancelAnimationFrame(frame); previous = 0;
      setReady(!reduce.matches);
      if (!reduce.matches && !document.hidden) frame = requestAnimationFrame(tick);
    }
    readColors(); resize(); syncMotion();
    const themeObserver = new MutationObserver(() => { readColors(); paint(); });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', syncMotion);
    reduce.addEventListener('change', syncMotion);
    scheme.addEventListener('change', readColors);
    return () => {
      cancelAnimationFrame(frame); themeObserver.disconnect();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', syncMotion);
      reduce.removeEventListener('change', syncMotion); scheme.removeEventListener('change', readColors);
    };
  }, [active]);
  return <div class={`${kind === 'app' ? 'app-bg' : 'ob-blobs'} ambient-backdrop${ready ? ' is-fluid' : ''}`} aria-hidden="true">
    <canvas ref={ref} class="ambient-fluid" />
    <div class="app-bg-blobs">
      <span class="app-blob app-blob-teal" /><span class="app-blob app-blob-mint" />
      <span class="app-blob app-blob-indigo" /><span class="app-blob app-blob-amber" />
    </div>
  </div>;
}
