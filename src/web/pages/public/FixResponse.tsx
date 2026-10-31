import { useState } from 'preact/hooks';
import type { ReportResponseRequest, ReportTrackResponse } from '../../../shared/api';
import { ApiError, api, errorMessage } from '../../api';
import { Banner } from '../../components/Banner';
import { SpeakButton } from '../../components/SpeakButton';
import { t, type TKey } from '../../i18n';
import { getReporterKey, storeReporterKey } from '../../reporterKeys';

export default function FixResponse({ report, onUpdated }: { report: ReportTrackResponse; onUpdated: (report: ReportTrackResponse) => void }) {
  const [key, setKey] = useState(() => getReporterKey(report.caseCode));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const pending = report.confirmationAvailable && report.status === 'resolved' && !report.fixResponse;
  const summary = report.fixResponse ? t(`closure.response.${report.fixResponse}` as TKey) : pending ? t('closure.secretHelp') : t('closure.waiting');

  async function respond(decision: 'confirmed' | 'disputed') {
    if (!key.trim()) { setError(t('closure.needSecret')); return; }
    setBusy(true); setError(null); setStale(false);
    try {
      const body: ReportResponseRequest = { reporterToken: key.trim(), decision, expectedVersion: report.version, note: note.trim() || undefined };
      const next = await api.post<ReportTrackResponse>(`/api/reports/track/${encodeURIComponent(report.caseCode)}/respond`, body);
      storeReporterKey(report.caseCode, key.trim()); onUpdated(next);
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      setStale(status === 409);
      setError(status === 409 ? t('closure.conflict') : status === 403 ? t('closure.invalidKey') : errorMessage(err));
    } finally { setBusy(false); }
  }

  async function refresh() {
    setBusy(true);
    try { onUpdated(await api.get<ReportTrackResponse>(`/api/reports/track/${encodeURIComponent(report.caseCode)}`)); setStale(false); setError(null); }
    catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }

  return <section class="closure-response stack" aria-label={t('closure.reviewTitle')}>
    <div class="heading-row"><h3>{t('closure.reviewTitle')}</h3><SpeakButton text={`${t('closure.reviewTitle')}. ${summary}`} /></div>
    {report.fixResponse ? <Banner tone={report.fixResponse === 'confirmed' ? 'success' : 'info'}>{summary}</Banner> : null}
    {!report.confirmationAvailable ? <p class="muted">{t('closure.unavailable')}</p> : report.fixResponse ? null : !pending ? <p class="muted">{t('closure.waiting')}</p> : <>
      <label class="field-label" for="reporter-key">{t('closure.secretLabel')}</label>
      <input id="reporter-key" type="password" autocomplete="off" spellcheck={false} maxLength={128} disabled={busy} value={key} onInput={(e) => setKey(e.currentTarget.value)} aria-describedby="reporter-key-help" />
      <p id="reporter-key-help" class="muted">{t('closure.secretHelp')}</p>
      <label class="field-label" for="response-note">{t('closure.noteLabel')}</label>
      <textarea id="response-note" disabled={busy} maxLength={500} rows={2} value={note} onInput={(e) => setNote(e.currentTarget.value)} />
      <div class="row">
        <button type="button" class="btn btn-primary" disabled={busy} onClick={() => void respond('confirmed')}>{busy ? t('closure.submitting') : t('closure.confirm')}</button>
        <button type="button" class="btn" disabled={busy} onClick={() => void respond('disputed')}>{t('closure.dispute')}</button>
      </div>
    </>}
    {error ? <Banner tone="danger">{error}</Banner> : null}
    {stale ? <button type="button" class="btn" disabled={busy} onClick={() => void refresh()}>{t('closure.reload')}</button> : null}
  </section>;
}
