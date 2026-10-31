import { useState } from 'preact/hooks';
import type { CorrectionRequest } from '../../../shared/types';
import { api, ApiError, errorMessage } from '../../api';
import { Banner } from '../../components/Banner';
import { CorrectionSummary } from '../../components/CorrectionSummary';
import { ErrorMessage } from '../../components/ErrorMessage';
import { Icon } from '../../components/Icon';
import { t } from '../../i18n';
import { LIVE_REFRESH_MS, useApiData } from '../../useApiData';

type AdminCorrection = CorrectionRequest & { workerId: string; workerName: string };
function ReviewForm({ request, onReviewed }: { request: AdminCorrection; onReviewed: () => void }) {
  const [status, setStatus] = useState<'approved' | 'rejected'>('approved'), [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false), [problem, setProblem] = useState<string | null>(null);
  async function review(event: Event) {
    event.preventDefault(); setBusy(true); setProblem(null);
    try { await api.post(`/api/admin/corrections/${encodeURIComponent(request.id)}`, { status, reason: reason.trim() }); onReviewed(); }
    catch (error) { setProblem(error instanceof ApiError && error.status === 409 ? t('correction.reviewConflict') : errorMessage(error)); }
    finally { setBusy(false); }
  }
  return <form class="stack" onSubmit={(event) => void review(event)}>
    <div class="field"><label for={`decision-${request.id}`}>{t('correction.decision')}</label><select id={`decision-${request.id}`} value={status} onChange={(e) => setStatus(e.currentTarget.value as 'approved' | 'rejected')}><option value="approved">{t('correction.approve')}</option><option value="rejected">{t('correction.reject')}</option></select></div>
    <div class="field"><label for={`review-${request.id}`}>{t('correction.reviewReason')}</label><textarea id={`review-${request.id}`} minLength={5} maxLength={500} required value={reason} onInput={(e) => setReason(e.currentTarget.value)} /></div>
    <button type="submit" class="btn btn-primary" disabled={busy}>{t('correction.saveReview')}</button>
    {problem ? <Banner tone="danger">{problem}</Banner> : null}
  </form>;
}
export default function Corrections({ onReviewed }: { onReviewed: () => void }) {
  const requests = useApiData<AdminCorrection[]>('/api/admin/corrections', { refreshMs: LIVE_REFRESH_MS });
  const [history, setHistory] = useState(false);
  const list = (requests.data ?? []).filter((r) => history ? r.status !== 'pending' : r.status === 'pending');
  const pending = requests.data?.filter((r) => r.status === 'pending').length ?? 0;
  return <details class="card details-card">
    <summary class="training-summary"><span>{t('correction.adminTitle')} {pending > 0 ? `(${pending})` : ''}</span><Icon name="file" size={20} /></summary>
    <div class="stack stack-pad">
      <p class="muted">{t('correction.adminHelp')}</p>
      <div class="segmented" role="group" aria-label={t('correction.adminTitle')}><button type="button" aria-pressed={!history} onClick={() => setHistory(false)}>{t('correction.pending')}</button><button type="button" aria-pressed={history} onClick={() => setHistory(true)}>{t('correction.history')}</button></div>
      {requests.error ? <ErrorMessage error={requests.error} onRetry={requests.reload} /> : null}
      {requests.data && list.length === 0 ? <p>{t('correction.empty')}</p> : null}
      {list.map((request) => <section key={request.id} class="stack correction-review"><h3>{request.workerName}</h3><CorrectionSummary request={request} />
        {request.status === 'pending' ? <ReviewForm request={request} onReviewed={() => { requests.reload(); onReviewed(); }} /> : null}
      </section>)}
    </div>
  </details>;
}
