import { useEffect, useState } from 'preact/hooks';
import type { ReportTrackResponse } from '../../../shared/api';
import type { ReportStatus } from '../../../shared/types';
import { ApiError, api, errorMessage } from '../../api';
import { Banner } from '../../components/Banner';
import { SeverityBadge } from '../../components/Badge';
import { Icon } from '../../components/Icon';
import { SpeakButton } from '../../components/SpeakButton';
import { Spinner } from '../../components/Spinner';
import { formatDay, t, type TKey } from '../../i18n';
import { useRoute } from '../../router';
import FixResponse from './FixResponse';
import './fix-confirmation.css';

const STEPS: ReportStatus[] = ['open', 'acknowledged', 'in_progress', 'resolved'];

function CaseHistory({ report }: { report: ReportTrackResponse }) {
  const currentIndex = STEPS.indexOf(report.status);
  return <>
    <h3>{t('track.timeline')} ({t('track.status')})</h3>
    <ol class="timeline">
      {STEPS.map((step, index) => <li key={step} class={index <= currentIndex ? 'done' : undefined} aria-current={index === currentIndex ? 'step' : undefined}>
        {index <= currentIndex ? <Icon name="check" size={20} /> : null}
        <span>{t(`status.${step}` as TKey)}</span>
      </li>)}
    </ol>
    <h3>{t('track.updates')}</h3>
    {report.updates.length === 0 ? <p class="muted">{t('track.noUpdates')}</p> : <ul class="lines">
      {report.updates.map((update, index) => <li key={`${update.day}-${index}`}><span>
        {formatDay(update.day)}: {update.fixResponse ? t(`closure.response.${update.fixResponse}` as TKey) : t(`status.${update.status}` as TKey)}
        {update.note ? ` — ${update.note}` : ''}
      </span></li>)}
    </ul>}
  </>;
}

export default function Track() {
  const route = useRoute();
  const codeParam = route.query.get('code');
  const [code, setCode] = useState(codeParam ?? '');
  const [report, setReport] = useState<ReportTrackResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function search(raw: string) {
    const clean = raw.trim().toUpperCase();
    if (!clean) return;
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      const result = await api.get<ReportTrackResponse>(`/api/reports/track/${encodeURIComponent(clean)}`);
      setReport(result);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 404 ? t('track.notFound') : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  // A shared link such as #/track?code=ABCD-EFGH looks the report up straight away.
  useEffect(() => {
    if (codeParam) {
      setCode(codeParam);
      void search(codeParam);
    }
  }, [codeParam]);

  return (
    <div class="stack">
      <h1>{t('track.title')}</h1>
      <form
        class="card stack"
        onSubmit={(event) => {
          event.preventDefault();
          void search(code);
        }}
      >
        <div class="field">
          <label class="field-label" for="case-code">
            {t('track.codeLabel')}
          </label>
          <input
            id="case-code"
            type="text"
            value={code}
            placeholder={t('track.codePlaceholder')}
            autocomplete="off"
            autocapitalize="characters"
            spellcheck={false}
            onInput={(event) => setCode((event.currentTarget).value)}
          />
          <p class="muted">{t('track.helpText')}</p>
        </div>
        <div class="row">
          <button type="submit" class="btn btn-primary" disabled={busy}>
            <Icon name="track" size={22} />
            {t('track.search')}
          </button>
          <SpeakButton text={t('track.search')} />
        </div>
      </form>

      {busy ? <Spinner /> : null}
      {error ? <Banner tone="danger">{error}</Banner> : null}

      {report ? (
        <section class="card stack" aria-labelledby="case-title">
          <h2 id="case-title">{report.caseCode}</h2>
          <p>{t('track.reportedOn', { day: formatDay(report.createdDay) })}</p>
          <p>
            {t('track.category')}: {t(`hazard.${report.category}` as TKey)}
          </p>
          <p>
            {t('track.severity')}: <SeverityBadge severity={report.severity} />
          </p>

          <CaseHistory report={report} />
          <FixResponse key={report.caseCode} report={report} onUpdated={setReport} />
        </section>
      ) : null}
    </div>
  );
}
