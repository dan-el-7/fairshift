import { useEffect, useState } from 'preact/hooks';
import QRCode from 'qrcode';
import type { QrResponse } from '../../../shared/api';
import { api } from '../../api';
import { ErrorMessage } from '../../components/ErrorMessage';
import { Spinner } from '../../components/Spinner';
import { Icon } from '../../components/Icon';
import { copyText } from '../../clipboard';
import { t } from '../../i18n';

const REFRESH_MS = 30_000;

/** Kiosk view: a large check-in QR code that refreshes every 30 seconds, with a visible countdown. */
export default function Qr() {
  const [image, setImage] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [nextAt, setNextAt] = useState(() => Date.now() + REFRESH_MS);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const res = await api.get<QrResponse>('/api/admin/qr');
        const url = await QRCode.toDataURL(res.token, { margin: 2, width: 480, errorCorrectionLevel: 'M' });
        if (!alive) return;
        setImage(url);
        setToken(res.token);
        setCopied(null);
        setError(null);
      } catch (err) {
        if (alive) {
          setError(err);
          setImage(null);
          setToken(null);
        }
      }
    }

    void load();
    const refresh = window.setInterval(() => {
      if (!alive) return;
      setNextAt(Date.now() + REFRESH_MS);
      void load();
    }, REFRESH_MS);
    const clock = window.setInterval(() => {
      if (alive) setNow(Date.now());
    }, 1000);

    return () => {
      alive = false;
      window.clearInterval(refresh);
      window.clearInterval(clock);
    };
  }, []);

  const seconds = Math.max(0, Math.ceil((nextAt - now) / 1000));

  return (
    <div class="stack qr-page">
      <h1>{t('admin.qr.title')}</h1>
      <p class="big">{t('admin.qr.help')}</p>

      {error ? <ErrorMessage error={error} /> : null}
      {image ? (
        <img class="qr-image qr-large" src={image} alt={t('admin.qr.alt')} width={320} height={320} />
      ) : error ? null : (
        <Spinner />
      )}

      <p class="big">{t('admin.qr.refreshIn', { seconds })}</p>
      <div class="countdown" aria-hidden="true">
        <div class="countdown-fill" style={{ width: `${Math.min(100, (seconds / (REFRESH_MS / 1000)) * 100)}%` }} />
      </div>
      <p class="muted">{t('admin.qr.hint')}</p>
      {token ? (
        <section class="card stack gate-code-card" aria-labelledby="gate-code-title">
          <h2 id="gate-code-title">{t('admin.qr.manualTitle')}</h2>
          <p class="muted">{t('admin.qr.manualHelp')}</p>
          <label class="field-label" for="kiosk-token">{t('attendance.codeLabel')}</label>
          <input id="kiosk-token" class="gate-token" value={token} readOnly spellcheck={false}
            onFocus={(event) => event.currentTarget.select()} />
          <button type="button" class="btn" onClick={() => { void copyText(token).then(setCopied); }}>
            <Icon name="copy" size={20} />{t('admin.qr.copyCode')}
          </button>
          {copied !== null ? <p role="status">{t(copied ? 'common.copied' : 'admin.qr.copyFailed')}</p> : null}
        </section>
      ) : null}
    </div>
  );
}
