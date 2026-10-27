import { useEffect, useState } from 'preact/hooks';
import QRCode from 'qrcode';
import type { Me, PassportMe } from '../../../shared/api';
import { Banner } from '../../components/Banner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { Icon } from '../../components/Icon';
import { SpeakButton } from '../../components/SpeakButton';
import { Spinner } from '../../components/Spinner';
import { copyText } from '../../clipboard';
import { formatDay, t, type TKey } from '../../i18n';
import { useApiData } from '../../useApiData';

export default function Skills(_props: { me: Me }) {
  const passport = useApiData<PassportMe>('/api/passport/me');
  const shareToken = passport.data?.shareToken ?? null;
  const shareUrl = shareToken ? `${window.location.origin}/#/verify?token=${encodeURIComponent(shareToken)}` : null;
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  useEffect(() => {
    let alive = true;
    setQr(null);
    if (shareUrl) {
      QRCode.toDataURL(shareUrl, { margin: 1, width: 240, errorCorrectionLevel: 'M' })
        .then((url) => {
          if (alive) setQr(url);
        })
        .catch(() => undefined);
    }
    return () => {
      alive = false;
    };
  }, [shareUrl]);

  async function share() {
    if (!shareUrl) return;
    try {
      await navigator.share({ title: t('skills.title'), url: shareUrl });
    } catch {
      // The user cancelled the share sheet. Nothing to report.
    }
  }

  async function copy() {
    if (!shareUrl) return;
    setCopied(await copyText(shareUrl));
  }

  return (
    <div class="stack">
      <h1>{t('skills.title')}</h1>

      {passport.loading && !passport.data ? <Spinner /> : null}
      {passport.error ? <ErrorMessage error={passport.error} onRetry={passport.reload} /> : null}

      {shareUrl ? (
        <section class="card stack" aria-labelledby="share-title">
          <h2 id="share-title">{t('skills.qrTitle')}</h2>
          <p class="muted">{t('skills.qrHelp')}</p>
          {qr ? <img class="qr-image" src={qr} alt={t('skills.qrAlt')} width={220} height={220} /> : null}
          <div class="row">
            {canShare ? (
              <button type="button" class="btn btn-primary" onClick={() => void share()}>
                <Icon name="share" size={22} />
                {t('common.share')}
              </button>
            ) : null}
            <button type="button" class="btn" onClick={() => void copy()}>
              <Icon name="copy" size={22} />
              {t('skills.copyLink')}
            </button>
            <SpeakButton text={t('skills.qrHelp')} />
          </div>
          {copied ? <Banner tone="success">{t('skills.linkCopied')}</Banner> : null}
        </section>
      ) : null}

      {passport.data ? (
        <section class="stack" aria-labelledby="entries-title">
          <h2 id="entries-title">{t('skills.entries')}</h2>
          {passport.data.entries.length === 0 ? <p class="muted">{t('skills.none')}</p> : null}
          <ul class="entries">
            {passport.data.entries.map((entry) => (
              <li key={entry.id}>
                <strong>{entry.title}</strong>
                <br />
                <span>{t(`passport.kind.${entry.kind}` as TKey)}</span>
                {entry.hours ? <span> · {t('skills.hours', { hours: entry.hours })}</span> : null}
                <br />
                <span class="muted">
                  {t('skills.issuedOn', { date: formatDay(entry.issuedOn) })} · {t('skills.issuedBy', { issuer: entry.issuer })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
