import { render } from 'preact';
import { App } from './app';
import { applySavedTextSize } from './components/TextSizeToggle';
import { applyTheme, savedTheme } from './theme';
import '@fontsource-variable/inter';
// Static Inter semibold (Latin) for the onboarding greeting: its glyphs have merged outlines, so the
// traced ink shows no overlapping contours (the variable font's 'e' does). Loaded only when used.
import '@fontsource/inter/latin-600.css';
import './styles.css';
import './qol.css';

// Before the first render, so a saved theme never flashes the other one.
applyTheme(savedTheme());
applySavedTextSize();
const mount = document.getElementById('app');
if (!mount) throw new Error('Missing #app mount point');
render(<App />, mount);

// Offline support only in production builds: the dev server must never serve stale cached assets.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
