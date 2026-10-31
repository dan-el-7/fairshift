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
import './skills-print.css';

function PassportEntries({ entries }: { entries: PassportMe['entries'] }) {
  return (
    <ul class="entry-list">
      {entries.map((entry) => (
        <li key={entry.id}>
          <strong>{entry.title}</strong><br />
          <span>{t(`passport.kind.${entry.kind}` as TKey)}</span>
          {entry.hours ? <span> · {t('skills.hours', { hours: entry.hours })}</span> : null}<br />
          <span class="muted">{t('skills.issuedOn', { date: formatDay(entry.issuedOn) })} · {t('skills.issuedBy', { issuer: entry.issuer })}</span>
        </li>
      ))}
    </ul>
  );
}

function PassportCard({ me, passport, shareUrl, qr }: { me: Me; passport: PassportMe; shareUrl: string | null; qr: string | null }) {
  return (
    <section class="card credential skills-passport" aria-labelledby="entries-title">
      <div class="skills-print-title">{t('skills.title')}</div>
      <div class="cred-head">
        <span class="cred-avatar" aria-hidden="true"><Icon name="user" size={24} /></span>
        <div class="stack" style={{ gap: '4px' }}>
          <span class="cred-name">{me.name}</span>
          <span class="muted">{me.jobTitle}</span>
        </div>
        <span class="badge badge-verified"><Icon name="verify" size={16} />{t('verify.valid')}</span>
      </div>
      <h2 id="entries-title">{t('skills.entries')}</h2>
      {passport.entries.length === 0 ? <p class="muted">{t('skills.none')}</p> : <PassportEntries entries={passport.entries} />}
      {shareUrl ? (
        <div class="skills-print-verify">
          {qr ? <img src={qr} alt={t('skills.qrAlt')} width={160} height={160} /> : null}
          <div><strong>{t('skills.verifyLink')}</strong><div class="skills-print-url">{shareUrl}</div></div>
        </div>
      ) : null}
    </section>
  );
}

function ShareCard({ qr, qrFailed, copied, canShare, onShare, onCopy }: {
  qr: string | null; qrFailed: boolean; copied: boolean; canShare: boolean; onShare: () => void; onCopy: () => void;
}) {
  return (
    <section class="card qr-card skills-screen-only" aria-labelledby="share-title">
      <h2 id="share-title">{t('skills.qrTitle')}</h2>
      <p class="muted">{t('skills.qrHelp')}</p>
      {qr ? <img class="qr-image" src={qr} alt={t('skills.qrAlt')} width={220} height={220} /> : null}
      {qrFailed ? <p class="muted">{t('skills.qrUnavailable')}</p> : null}
      <div class="row">
        {canShare ? <button type="button" class="btn btn-primary" onClick={onShare}><Icon name="share" size={20} />{t('common.share')}</button> : null}
        <button type="button" class="btn" onClick={onCopy}><Icon name="copy" size={20} />{t('skills.copyLink')}</button>
        <SpeakButton text={t('skills.qrHelp')} />
      </div>
      {copied ? <Banner tone="success">{t('skills.linkCopied')}</Banner> : null}
    </section>
  );
}

export default function Skills({ me }: { me: Me }) {
  const passport = useApiData<PassportMe>('/api/passport/me');
  const shareToken = passport.data?.shareToken ?? null;
  const shareUrl = shareToken ? `${window.location.origin}/#/verify?token=${encodeURIComponent(shareToken)}` : null;
  const [qr, setQr] = useState<string | null>(null);
  const [qrFailed, setQrFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  useEffect(() => {
    let alive = true;
    setQr(null);
    setQrFailed(false);
    if (shareUrl) {
      QRCode.toDataURL(shareUrl, { margin: 1, width: 240, errorCorrectionLevel: 'M' })
        .then((url) => {
          if (alive) setQr(url);
        })
        .catch(() => {
          if (alive) setQrFailed(true);
        });
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
    <div class="stack skills-page">
      <h1>{t('skills.title')}</h1>

      {passport.loading && !passport.data ? <Spinner /> : null}
      {passport.error ? <ErrorMessage error={passport.error} onRetry={passport.reload} /> : null}

      {passport.data ? (
        <PassportCard me={me} passport={passport.data} shareUrl={shareUrl} qr={qr} />
      ) : null}

      {shareUrl ? (
        <ShareCard qr={qr} qrFailed={qrFailed} copied={copied} canShare={canShare} onShare={() => void share()} onCopy={() => void copy()} />
      ) : null}
      {passport.data ? (
        <button type="button" class="btn btn-primary skills-screen-only" disabled={Boolean(shareUrl && !qr && !qrFailed)} onClick={() => window.print()}>
          {t('skills.print')}
        </button>
      ) : null}
    </div>
  );
}
