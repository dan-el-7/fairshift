import { useState } from 'preact/hooks';
import type { PaymentSummary } from '../../../shared/payments';
import { api, ApiError } from '../../api';
import { Banner } from '../../components/Banner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { Icon } from '../../components/Icon';
import { Spinner } from '../../components/Spinner';
import { formatDay, formatMoney, LOCALE_TAG, periodLabel, t, useLang, type TKey } from '../../i18n';
import { speak } from '../../speech';
import { useApiData } from '../../useApiData';
import '../../payment-receipts.css';

function recentPeriods(count: number): string[] {
  const ist = new Date(Date.now() + 330 * 60_000); let year = ist.getUTCFullYear(), month = ist.getUTCMonth() + 1;
  return Array.from({ length: count }, () => { const id = `${year}-${String(month).padStart(2, '0')}`; if (--month === 0) { month = 12; year--; } return id; });
}

interface AdminPayments { period: string; summaries: (PaymentSummary & { workerId: string; workerName: string })[]; ledgerVersions: Record<string, number> }
export default function Payments() {
  const lang = useLang();
  const periods = recentPeriods(6);
  const [period, setPeriod] = useState(periods[0] ?? new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 7));
  const data = useApiData<AdminPayments>(`/api/admin/payments?period=${period}`);
  const [workerId, setWorkerId] = useState(''); const [amount, setAmount] = useState(''); const [date, setDate] = useState(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })); const [reference, setReference] = useState(''); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [error, setError] = useState('');
  const current = data.data?.period === period ? data.data : undefined;
  const selected = current?.summaries.find((row) => row.workerId === workerId);
  async function submit(event: Event) {
    event.preventDefault(); if (!selected || !current) return;
    setBusy(true); setError(''); setMessage('');
    try {
      if (!/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) > 1_000_000) { setError(t('payment.invalidAmount')); return; }
      await api.post('/api/admin/payments', { workerId, period, amount: Math.round(Number(amount) * 100), date, reference: reference.trim() || undefined, note: note.trim() || undefined, expectedVersion: current.ledgerVersions[workerId] ?? 0 });
      setMessage(t('payment.saved')); setAmount(''); setReference(''); setNote(''); data.reload();
    } catch (err) { setError(err instanceof ApiError && err.status === 409 ? t('payment.stale') : t('payment.error')); data.reload(); }
    finally { setBusy(false); }
  }
  return <section class="stack"><h2>{t('payment.adminTitle')}</h2><p class="muted">{t('payment.recordDisclaimer')}</p>
    <div class="field"><label class="field-label" for="payment-period">{t('payment.period')}</label><select id="payment-period" disabled={busy} value={period} onChange={(e) => setPeriod(e.currentTarget.value)}>{periods.map((p) => <option key={p} value={p}>{periodLabel(p)}</option>)}</select></div>
    {data.loading && !current ? <Spinner/> : null}{data.error ? <ErrorMessage error={data.error} onRetry={data.reload}/> : null}
    {current ? <>
      <div class="payment-ledger" aria-label={t('payment.adminTitle')}>{current.summaries.map((row) => <article key={row.workerId} class="card payment-card"><h3>{row.workerName}</h3><dl class="payment-totals"><div><dt>{t('payment.expected')}</dt><dd>{formatMoney(row.expected)}</dd></div><div><dt>{t('payment.recorded')}</dt><dd>{row.hasRecordedPayment ? formatMoney(row.recorded) : t('payment.none')}</dd></div><div><dt>{t(row.overpaid > 0 ? 'payment.overpaid' : 'payment.outstanding')}</dt><dd>{formatMoney(row.overpaid > 0 ? row.overpaid : row.outstanding)}</dd></div></dl><p>{row.records.some((r) => r.confirmation?.decision === 'not_received' || r.confirmation?.decision === 'different_amount') ? t('payment.disputed') : row.records.length ? t('payment.recordedStatus') : t('payment.noRecord')}</p></article>)}</div>
      <form class="payment-card card stack" onSubmit={(e) => void submit(e)}><h3>{t('payment.recordTitle')}</h3>
        <div class="field"><label class="field-label" for="payment-worker">{t('payment.worker')}</label><select id="payment-worker" required disabled={busy} value={workerId} onChange={(e) => setWorkerId(e.currentTarget.value)}><option value="">{t('payment.chooseWorker')}</option>{current.summaries.map((row) => <option key={row.workerId} value={row.workerId}>{row.workerName}</option>)}</select></div>
        {selected ? <p>{t('payment.expected')}: {formatMoney(selected.expected)}</p> : null}
        <div class="field"><label class="field-label" for="payment-amount">{t('payment.amount')}</label><input id="payment-amount" required disabled={busy} type="number" min="0" max="1000000" step="0.01" value={amount} onInput={(e) => setAmount(e.currentTarget.value)}/></div>
        <div class="field"><label class="field-label" for="payment-date">{t('payment.date')}</label><input id="payment-date" required disabled={busy} type="date" min={new Date(Date.now() - 183 * 86_400_000).toISOString().slice(0, 10)} max={new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })} value={date} onInput={(e) => setDate(e.currentTarget.value)}/></div>
        <div class="field"><label class="field-label" for="payment-ref">{t('payment.reference')}</label><input id="payment-ref" disabled={busy} maxLength={100} value={reference} onInput={(e) => setReference(e.currentTarget.value)}/></div>
        <div class="field"><label class="field-label" for="payment-note">{t('payment.note')}</label><textarea id="payment-note" disabled={busy} maxLength={500} value={note} onInput={(e) => setNote(e.currentTarget.value)}/></div>
        <button class="btn btn-primary" disabled={busy || !selected}>{t('payment.save')}</button>{error ? <Banner tone="danger">{error}</Banner> : null}{message ? <Banner tone="success">{message}</Banner> : null}
      </form>
      {current.summaries.flatMap((row) => row.records.map((record) => <article key={record.id} class="card payment-card"><div class="payment-heading"><strong>{row.workerName} · {formatMoney(record.amount)}</strong><button class="btn" type="button" onClick={() => speak(`${row.workerName}. ${formatMoney(record.amount)}. ${periodLabel(period)}. ${record.confirmation ? t(`payment.confirm.${record.confirmation.decision}` as TKey) : t('payment.awaitingConfirmation')}. ${record.confirmation?.receivedAmount !== undefined ? `${t('payment.reportedAmount')}: ${formatMoney(record.confirmation.receivedAmount)}.` : ''} ${record.confirmation?.reason ?? ''}`, lang)} aria-label={t('payment.read')}><Icon name="speaker" size={20}/>{t('payment.read')}</button></div><p>{t('payment.paidOn')}: {formatDay(record.paidOn ?? record.recordedAt.slice(0, 10))} · {t('payment.recordedAt')}: {new Intl.DateTimeFormat(LOCALE_TAG[lang], { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(record.recordedAt))}{record.recordedBy ? ` · ${record.recordedBy}` : ''}{record.reference ? ` · ${record.reference}` : ''}</p>{record.note ? <p>{record.note}</p> : null}{record.confirmation ? <p>{t(`payment.confirm.${record.confirmation.decision}` as TKey)}{record.confirmation.receivedAmount !== undefined ? ` · ${t('payment.reportedAmount')}: ${formatMoney(record.confirmation.receivedAmount)}` : ''}{record.confirmation.reason ? `: ${record.confirmation.reason}` : ''}</p> : <p>{t('payment.awaitingConfirmation')}</p>}</article>))}
    </> : null}
  </section>;
}
