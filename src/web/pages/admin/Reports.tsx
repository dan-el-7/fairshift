import { useState } from 'preact/hooks';
import type { ReportAdmin } from '../../../shared/api';
import type { ReportStatus } from '../../../shared/types';
import { api } from '../../api';
import { Banner } from '../../components/Banner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { SeverityBadge } from '../../components/Badge';
import { SpeakButton } from '../../components/SpeakButton';
import { Spinner } from '../../components/Spinner';
import { formatDay, t, useLang, type TKey } from '../../i18n';
import { LIVE_REFRESH_MS, useApiData } from '../../useApiData';
import { categoryLabel, REPORT_STATUSES, sortReports } from './shared';

interface ReportItemProps {
  report: ReportAdmin;
  onUpdated: (next: ReportAdmin) => void;
}

/** One report with its status form. Saving replaces this item in place. */
function ReportItem({ report, onUpdated }: ReportItemProps) {
  const lang = useLang();
  const [status, setStatus] = useState<ReportStatus>(report.status);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit(event: Event) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const body = { status, note: note.trim() || undefined };
      const next = await api.patch<ReportAdmin>(`/api/admin/reports/${encodeURIComponent(report.id)}`, body);
      onUpdated(next);
      setStatus(next.status);
      setNote('');
      setSaved(true);
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  const statusId = `report-status-${report.id}`;
  const noteId = `report-note-${report.id}`;

  // English text in English; the original when it already matches the UI language; otherwise the English translation.
  const spokenText = lang === 'en' ? report.textEn : report.language === lang ? report.text : report.textEn;
  const speech = t('admin.speech.report', {
    category: categoryLabel(report.category),
    severity: t(`severity.${report.severity}` as TKey),
    status: t(`status.${report.status}` as TKey),
    text: spokenText,
  });

  return (
    <li id={`report-${report.id}`} class={`report-card sev-${report.severity}`}>
      <div class="row">
        <code class="report-code">{report.caseCode}</code>
        <SeverityBadge severity={report.severity} />
        <span class="badge badge-status">{t(`status.${report.status}` as TKey)}</span>
        {report.overdue ? <span class="badge badge-critical">{t('admin.reports.overdue')}</span> : null}
        <SpeakButton text={speech} />
      </div>
      <p class="muted">
        {categoryLabel(report.category)} · {t('track.reportedOn', { day: formatDay(report.createdDay) })}
      </p>
      <p lang="en">{report.textEn}</p>
      {report.text !== report.textEn ? (
        <p>
          <span class="muted">{t('admin.reports.originalText')}: </span>
          <span lang={report.language}>{report.text}</span>
        </p>
      ) : null}

      <details>
        <summary>
          {t('track.updates')} ({report.updates.length})
        </summary>
        {report.updates.length === 0 ? (
          <p class="muted">{t('track.noUpdates')}</p>
        ) : (
          <ul class="plain-list">
            {report.updates.map((update, index) => (
              <li key={`${update.day}-${index}`}>
                {formatDay(update.day)} · {t(`status.${update.status}` as TKey)}
                {update.note ? ` — ${update.note}` : ''}
              </li>
            ))}
          </ul>
        )}
      </details>

      <form class="stack report-form" onSubmit={(event) => void submit(event)}>
        <div class="field">
          <label class="field-label" for={statusId}>
            {t('admin.reports.newStatus')}
          </label>
          <select id={statusId} value={status} onChange={(event) => setStatus((event.currentTarget).value as ReportStatus)}>
            {REPORT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {t(`status.${value}` as TKey)}
              </option>
            ))}
          </select>
        </div>
        <div class="field">
          <label class="field-label" for={noteId}>
            {t('admin.reports.note')}
          </label>
          <textarea
            id={noteId}
            rows={2}
            maxLength={500}
            value={note}
            onInput={(event) => setNote((event.currentTarget).value)}
          />
        </div>
        <button type="submit" class="btn btn-primary" disabled={saving}>
          {saving ? t('admin.reports.saving') : t('admin.reports.save')}
        </button>
      </form>
      {error ? <ErrorMessage error={error} /> : null}
      {saved ? <Banner tone="success">{t('admin.reports.saved')}</Banner> : null}
    </li>
  );
}

export default function Reports() {
  const reports = useApiData<ReportAdmin[]>('/api/admin/reports', { refreshMs: LIVE_REFRESH_MS });
  const [updates, setUpdates] = useState<Record<string, ReportAdmin>>({});

  const list = reports.data
    ? sortReports(reports.data.map((report) => updates[report.id] ?? report))
    : [];

  return (
    <div class="stack">
      <h1>{t('admin.reports.title')}</h1>
      <p class="muted">{t('admin.reports.sortNote')}</p>

      {reports.loading && !reports.data ? <Spinner /> : null}
      {reports.error ? <ErrorMessage error={reports.error} onRetry={reports.reload} /> : null}

      {reports.data && list.length === 0 ? <p>{t('admin.reports.empty')}</p> : null}

      {list.length > 0 ? (
        <ul class="entries">
          {list.map((report) => (
            <ReportItem
              key={report.id}
              report={report}
              onUpdated={(next) => setUpdates((prev) => ({ ...prev, [next.id]: next }))}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
