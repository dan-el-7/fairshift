import { useState } from 'preact/hooks';
import type { PaymentSummary as Summary } from '../../../shared/payments';
import { api, ApiError } from '../../api';
import { Banner } from '../../components/Banner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { Icon } from '../../components/Icon';
import { Spinner } from '../../components/Spinner';
import { formatDay, formatMoney, periodLabel, t, useLang, type TKey } from '../../i18n';
import { speak } from '../../speech';
import { useApiData } from '../../useApiData';
import '../../payment-receipts.css';

export default function PaymentSummary({ period }: { period: string }) {
  const lang = useLang();
  const data = useApiData<Summary>(`/api/payments/me?period=${encodeURIComponent(period)}`);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [challenge, setChallenge] = useState<{ id: string; decision: 'not_received' | 'different_amount' } | null>(null);
  const [actual, setActual] = useState('');
  const [reason, setReason] = useState('');
  const summary = data.data?.period === period ? data.data : undefined;
  async function confirm(recordId: string, decision: 'received' | 'not_received' | 'different_amount') {
    if (!summary) return;
    setBusy(recordId); setError('');
    try {
      await api.post('/api/payments/me/confirm', { recordId, decision, ...(decision === 'different_amount' ? { receivedAmount: Math.round(Number(actual) * 100) } : {}), ...(decision !== 'received' ? { reason: reason.trim() } : {}), expectedVersion: summary.ledgerVersion });
      data.reload(); setChallenge(null); setActual(''); setReason('');
    } catch (err) {
      setError(err instanceof ApiError && err.status === 409 ? t('payment.stale') : t('payment.error'));
      data.reload();
    } finally { setBusy(null); }
  }
  if (data.loading && !summary) return <section class="payment-card card"><Spinner /></section>;
  if (data.error && !summary) return <section class="payment-card card"><ErrorMessage error={data.error} onRetry={data.reload} /></section>;
  if (!summary) return null;
  const speech = t('payment.summarySpeech', { period: periodLabel(period), expected: formatMoney(summary.expected), paid: summary.hasRecordedPayment ? formatMoney(summary.recorded) : t('payment.none') });
  return <section class="payment-card card stack" aria-labelledby="payment-summary-title">
    <div class="payment-heading"><h2 id="payment-summary-title">{t('payment.title')}</h2><button class="btn" type="button" onClick={() => speak(speech, lang)} aria-label={t('payment.read')}><Icon name="speaker" size={20}/>{t('payment.read')}</button></div>
    <p class="muted">{periodLabel(period)}</p>
    <p class="muted">{t('payment.recordDisclaimer')}</p>
    <dl class="payment-totals"><div><dt>{t('payment.expected')}</dt><dd>{formatMoney(summary.expected)}</dd></div><div><dt>{t('payment.recorded')}</dt><dd>{summary.hasRecordedPayment ? formatMoney(summary.recorded) : t('payment.none')}</dd></div><div><dt>{summary.overpaid ? t('payment.overpaid') : t('payment.outstanding')}</dt><dd>{formatMoney(summary.overpaid || summary.outstanding)}</dd></div></dl>
    {summary.records.length === 0 ? <p class="payment-status">{t('payment.noRecord')}</p> : <ul class="payment-records">{summary.records.map((record) => <li key={record.id}>
      <div><strong>{formatMoney(record.amount)}</strong><p>{formatDay(record.paidOn ?? record.recordedAt.slice(0, 10))}{record.reference ? ` · ${record.reference}` : ''}</p>{record.note ? <p>{record.note}</p> : null}<button class="btn" type="button" onClick={() => speak(`${formatMoney(record.amount)}. ${formatDay(record.paidOn ?? record.recordedAt.slice(0, 10))}. ${record.confirmation ? t(`payment.confirm.${record.confirmation.decision}` as TKey) : t('payment.awaitingConfirmation')}. ${record.confirmation?.receivedAmount !== undefined ? `${t('payment.reportedAmount')}: ${formatMoney(record.confirmation.receivedAmount)}.` : ''} ${record.confirmation?.reason ?? ''}`, lang)} aria-label={t('payment.read')}><Icon name="speaker" size={20}/>{t('payment.read')}</button></div>
      {record.confirmation ? <div class="payment-status"><strong>{t(`payment.confirm.${record.confirmation.decision}` as TKey)}</strong>{record.confirmation.receivedAmount !== undefined ? <p>{t('payment.reportedAmount')}: {formatMoney(record.confirmation.receivedAmount)}</p> : null}{record.confirmation.reason ? <p>{t('payment.reason')}: {record.confirmation.reason}</p> : null}</div> : <div class="stack payment-buttons"><button class="btn btn-primary" disabled={!!busy} onClick={() => void confirm(record.id, 'received')}>{busy === record.id ? t('common.loading') : t('payment.received')}</button><button class="btn" disabled={!!busy} onClick={() => setChallenge({ id: record.id, decision: 'not_received' })}>{t('payment.notReceived')}</button><button class="btn" disabled={!!busy} onClick={() => setChallenge({ id: record.id, decision: 'different_amount' })}>{t('payment.differentAmount')}</button>{challenge?.id === record.id ? <form class="stack" onSubmit={(event) => { event.preventDefault(); void confirm(record.id, challenge.decision); }}>
        {challenge.decision === 'different_amount' ? <div class="field"><label class="field-label" for={`actual-${record.id}`}>{t('payment.reportedAmount')}</label><input id={`actual-${record.id}`} type="number" min="0" max="1000000" step="0.01" required disabled={!!busy} value={actual} onInput={(e) => setActual(e.currentTarget.value)}/></div> : null}
        <div class="field"><label class="field-label" for={`reason-${record.id}`}>{t('payment.reason')}</label><textarea id={`reason-${record.id}`} minLength={3} maxLength={500} required disabled={!!busy} value={reason} onInput={(e) => setReason(e.currentTarget.value)}/></div>
        <button class="btn btn-primary" type="submit" disabled={!!busy || reason.trim().length < 3}>{t('payment.submitConfirmation')}</button><button class="btn" type="button" disabled={!!busy} onClick={() => setChallenge(null)}>{t('payment.cancel')}</button>
      </form> : null}</div>}
    </li>)}</ul>}
    {error ? <Banner tone="danger">{error}</Banner> : null}
  </section>;
}
