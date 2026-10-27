import { render } from 'preact';
import { App } from './app';
import { applySavedTextSize } from './components/TextSizeToggle';
import { applyTheme, savedTheme } from './theme';
import './styles.css';
import './qol.css';

// Before the first render, so a saved theme never flashes the other one.
applyTheme(savedTheme());
applySavedTextSize();
render(<App />, document.getElementById('app') as HTMLElement);

// Offline support only in production builds: the dev server must never serve stale cached assets.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
