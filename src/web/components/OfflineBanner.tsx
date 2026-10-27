import { useEffect, useState } from 'preact/hooks';
import { t, useLang } from '../i18n';

/** Shows a notice while the browser is offline. The container stays in place so screen readers announce changes. */
export function OfflineBanner() {
  useLang();
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine);

  useEffect(() => {
    const goOnline = () => setOffline(false);
    const goOffline = () => setOffline(true);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return (
    <div class="qol-offline" role="status">
      {offline && <p class="qol-offline-box">{t('offline.message')}</p>}
    </div>
  );
}
