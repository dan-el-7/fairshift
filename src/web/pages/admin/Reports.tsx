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
import { navigate, useRoute } from '../../router';
import { LIVE_REFRESH_MS, useApiData } from '../../useApiData';
import { categoryLabel, REPORT_STATUSES, SEVERITIES, sortReports } from './shared';
import { INDUSTRIES } from '../../../shared/industries';

const FILTERS = ['unresolved', 'overdue', 'resolved', 'all'] as const;
type Filter = typeof FILTERS[number];

interface ReportItemProps {
  report: ReportAdmin;
  onUpdated: (next: ReportAdmin) => void;
}

/** A draft belongs to the case, not to the polling response: quiet refreshes preserve edits. */
function ReportForm({ report, onUpdated }: ReportItemProps) {
  const [status, setStatus] = useState<ReportStatus | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const statusId = `report-status-${report.id}`;
  const noteId = `report-note-${report.id}`;

  async function submit(event: Event) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body = { status: status ?? report.status, note: note.trim() || undefined, expectedVersion: report.version ?? 0 };
      const next = await api.patch<ReportAdmin>(`/api/admin/reports/${encodeURIComponent(report.id)}`, body);
      onUpdated(next);
      setStatus(null);
      setNote('');
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form class="stack report-form" onSubmit={(event) => void submit(event)}>
      <div class="field">
        <label class="field-label" for={statusId}>{t('admin.reports.newStatus')}</label>
        <select id={statusId} value={status ?? report.status} disabled={saving}
          onChange={(event) => setStatus(event.currentTarget.value as ReportStatus)}>
          {REPORT_STATUSES.map((value) => (
            <option key={value} value={value}>{t(`status.${value}` as TKey)}</option>
          ))}
        </select>
      </div>
      <div class="field">
        <label class="field-label" for={noteId}>{t('admin.reports.note')}</label>
        <textarea id={noteId} rows={2} maxLength={500} value={note} disabled={saving}
          aria-describedby={`${noteId}-help`}
          onInput={(event) => setNote(event.currentTarget.value)} />
        <p id={`${noteId}-help`} class="muted">{t('admin.reports.noteHelp')}</p>
      </div>
      <button type="submit" class="btn btn-primary" disabled={saving}>
        {saving ? t('admin.reports.saving') : t('admin.reports.save')}
      </button>
      {error ? <ErrorMessage error={error} /> : null}
    </form>
  );
}

function ReportHistory({ report }: { report: ReportAdmin }) {
  return (
    <details>
      <summary>{t('track.updates')} ({report.updates.length})</summary>
      {report.updates.length === 0 ? <p class="muted">{t('track.noUpdates')}</p> : (
        <ul class="plain-list">
          {report.updates.map((update, index) => (
            <li key={`${update.day}-${index}`}>
              {formatDay(update.day)} · {update.fixResponse ? t(`closure.response.${update.fixResponse}` as TKey) : t(`status.${update.status}` as TKey)}
              {update.note ? ` — ${update.note}` : ''}
              {update.fixResponse ? ` — ${t(`closure.response.${update.fixResponse}` as TKey)}` : ''}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

function ReportItem({ report, onUpdated }: ReportItemProps) {
  const lang = useLang();
  // Speak the original when it matches the UI language; otherwise use the English translation.
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
        {report.fixResponse ? <span class="badge">{t(`closure.response.${report.fixResponse}` as TKey)}</span> : null}
        {report.overdue ? <span class="badge badge-critical">{t('admin.reports.overdue')}</span> : null}
        <SpeakButton text={speech} />
      </div>
      <p class="muted">
        {categoryLabel(report.category)} · {t('track.reportedOn', { day: formatDay(report.createdDay) })}
      </p>
      <p lang="en">{report.textEn}</p>
      {report.text !== report.textEn ? (
        <p><span class="muted">{t('admin.reports.originalText')}: </span><span lang={report.language}>{report.text}</span></p>
      ) : null}
      <ReportHistory report={report} />
      <details class="report-editor">
        <summary>{t('admin.reports.update')}</summary>
        <ReportForm report={report} onUpdated={onUpdated} />
      </details>
    </li>
  );
}

function queuePath(filter: Filter, severity: string, category = ''): string {
  const query = new URLSearchParams({ filter });
  if (severity) query.set('severity', severity);
  if (category) query.set('category', category);
  return `/a/reports?${query.toString()}`;
}

function matchesQueue(report: ReportAdmin, filter: Filter, severity: string, category: string, search: string): boolean {
  if (filter === 'unresolved' && report.status === 'resolved') return false;
  if (filter === 'resolved' && report.status !== 'resolved') return false;
  if (filter === 'overdue' && (!report.overdue || report.status === 'resolved')) return false;
  if (severity && report.severity !== severity) return false;
  if (category && report.category !== category) return false;
  const clean = (value: string) => value.toUpperCase().replace(/[-\s]/g, '');
  return clean(report.caseCode).includes(clean(search));
}

interface QueueFiltersProps {
  filter: Filter;
  severity: string;
  search: string;
  category: string;
  onSearch: (value: string) => void;
  onCategory: (value: string) => void;
}

function QueueFilters({ filter, severity, category, search, onSearch, onCategory }: QueueFiltersProps) {
  return (
    <section class="card stack report-filters" aria-label={t('admin.reports.filters')}>
      <div class="segmented" role="group" aria-label={t('admin.reports.filters')}>
        {FILTERS.map((value) => (
          <button key={value} type="button" aria-pressed={filter === value}
            onClick={() => navigate(queuePath(value, severity, category))}>
            {t(`admin.reports.filter.${value}` as TKey)}
          </button>
        ))}
      </div>
      <div class="report-filter-fields">
        <div class="field">
          <label class="field-label" for="report-search">{t('admin.reports.search')}</label>
          <input id="report-search" type="search" value={search} maxLength={32} spellcheck={false}
            onInput={(event) => onSearch(event.currentTarget.value)} />
        </div>
        <div class="field">
          <label class="field-label" for="report-priority">{t('track.severity')}</label>
          <select id="report-priority" value={severity}
            onChange={(event) => navigate(queuePath(filter, event.currentTarget.value, category))}>
            <option value="">{t('admin.reports.allPriorities')}</option>
            {SEVERITIES.map((value) => (
              <option key={value} value={value}>{t(`severity.${value}` as TKey)}</option>
            ))}
          </select>
        </div>
        <div class="field"><label class="field-label" for="report-category-filter">{t('closure.categoryFilter')}</label><select id="report-category-filter" value={category} onChange={(event) => { onCategory(event.currentTarget.value); navigate(queuePath(filter, severity, event.currentTarget.value)); }}><option value="">{t('closure.allCategories')}</option>{[...new Set([...Object.values(INDUSTRIES).flatMap((cfg) => cfg.hazardCategories), category].filter(Boolean))].map((value) => <option key={value} value={value}>{categoryLabel(value)}</option>)}</select></div>
      </div>
    </section>
  );
}

export default function Reports() {
  const reports = useApiData<ReportAdmin[]>('/api/admin/reports', { refreshMs: LIVE_REFRESH_MS });
  const [updates, setUpdates] = useState<Record<string, ReportAdmin>>({});
  const [saved, setSaved] = useState<ReportAdmin | null>(null);
  const [search, setSearch] = useState('');
  const { query } = useRoute();
  const filter = FILTERS.find((value) => value === query.get('filter')) ?? 'unresolved';
  const severity = SEVERITIES.find((value) => value === query.get('severity')) ?? '';
  const category = query.get('category') ?? '';
  const list = sortReports((reports.data ?? []).map((report) => {
    const next = updates[report.id];
    // Updates are append-only. The saved response bridges a stale poll, but never masks a newer server response.
    return next?.createdDay === report.createdDay && next.updates.length > report.updates.length ? next : report;
  })).filter((report) => matchesQueue(report, filter, severity, category, search));

  function updated(next: ReportAdmin) {
    setUpdates((previous) => ({ ...previous, [next.id]: next }));
    setSaved(next);
  }

  return (
    <div class="stack">
      <h1>{t('admin.reports.title')}</h1>
      <p class="muted">{t('admin.reports.sortNote')}</p>
      <QueueFilters filter={filter} severity={severity} category={category} search={search} onSearch={setSearch} onCategory={() => undefined} />
      {saved ? <Banner key={`${saved.id}-${saved.updates.length}`} tone="success">{t('admin.reports.saved')}</Banner> : null}
      {reports.loading && !reports.data ? <Spinner /> : null}
      {reports.error ? <ErrorMessage error={reports.error} onRetry={reports.reload} /> : null}
      {reports.data && list.length === 0 ? (
        <p role="status">{reports.data.length === 0 ? t('admin.reports.empty') : t('admin.reports.noMatches')}</p>
      ) : null}
      {list.length > 0 ? (
        <ul class="entries">
          {list.map((report) => <ReportItem key={report.id} report={report} onUpdated={updated} />)}
        </ul>
      ) : null}
    </div>
  );
}
