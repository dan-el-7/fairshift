import { render } from 'preact';
import { App } from './app';
import { applySavedTextSize } from './components/TextSizeToggle';
import './styles.css';
import './qol.css';

applySavedTextSize();
render(<App />, document.getElementById('app') as HTMLElement);

// Offline support only in production builds: the dev server must never serve stale cached assets.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
