import { render } from 'preact';
import { App } from './app';
import { applySavedTextSize } from './components/TextSizeToggle';
import { applyTheme, savedTheme } from './theme';
import '@fontsource-variable/inter';
import '@fontsource-variable/noto-sans-devanagari/wght.css';
import '@fontsource-variable/noto-sans-tamil/wght.css';
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
