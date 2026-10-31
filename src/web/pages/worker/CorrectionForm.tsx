import { useState } from 'preact/hooks';
import type { CorrectionRequest, Shift } from '../../../shared/types';
import { api, ApiError, errorMessage } from '../../api';
import { Banner } from '../../components/Banner';
import { CorrectionSummary } from '../../components/CorrectionSummary';
import { ErrorMessage } from '../../components/ErrorMessage';
import { SpeakButton } from '../../components/SpeakButton';
import { formatTime, istDay, t } from '../../i18n';
import { useApiData } from '../../useApiData';

interface CorrectionData { requests: CorrectionRequest[]; shifts: Shift[] }
const localTime = (iso: string) => new Date(Date.parse(iso) + 330 * 60_000).toISOString().slice(0, 16);
function ProposalForm({ day, shifts, onSaved }: { day: string; shifts: Shift[]; onSaved: () => void }) {
  const [kind, setKind] = useState<'shift' | 'pay'>('shift');
  const [shiftId, setShiftId] = useState('');
  const [start, setStart] = useState(`${day}T09:00`), [end, setEnd] = useState(`${day}T17:00`);
  const [amount, setAmount] = useState(''), [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false), [problem, setProblem] = useState<string | null>(null);
  function chooseShift(id: string) {
    setShiftId(id);
    const shift = shifts.find((s) => s.id === id);
    setStart(shift ? localTime(shift.checkIn) : `${day}T09:00`);
    setEnd(shift?.checkOut ? localTime(shift.checkOut) : `${day}T17:00`);
  }
  async function submit(event: Event) {
    event.preventDefault(); setBusy(true); setProblem(null);
    try {
      const body = kind === 'pay' ? { kind, day, amount: Math.round(Number(amount) * 100), reason: reason.trim() }
        : { kind, day, reason: reason.trim(), ...(shiftId ? { shiftId } : {}), checkIn: new Date(start + '+05:30').toISOString(), checkOut: new Date(end + '+05:30').toISOString() };
      await api.post('/api/corrections/me', body); onSaved();
    } catch (error) {
      setProblem(error instanceof ApiError && [400, 409].includes(error.status) ? t(error.status === 409 ? 'correction.conflict' : 'correction.invalid') : errorMessage(error));
    } finally { setBusy(false); }
  }
  const dayShifts = shifts.filter((s): s is Shift & { checkOut: string } => s.checkOut !== null && istDay(s.checkIn) === day);
  return <form class="stack" onSubmit={(event) => void submit(event)}>
    <div class="field"><label for={`correction-kind-${day}`}>{t('correction.type')}</label><select id={`correction-kind-${day}`} value={kind} onChange={(e) => setKind(e.currentTarget.value as 'shift' | 'pay')}><option value="shift">{t('correction.shift')}</option><option value="pay">{t('correction.pay')}</option></select></div>
    {kind === 'shift' ? <>
      <div class="field"><label for={`correction-shift-${day}`}>{t('correction.record')}</label><select id={`correction-shift-${day}`} value={shiftId} onChange={(e) => chooseShift(e.currentTarget.value)}><option value="">{t('correction.missing')}</option>{dayShifts.map((s) => <option key={s.id} value={s.id}>{formatTime(s.checkIn)} → {formatTime(s.checkOut)}</option>)}</select></div>
      <div class="days-off-fields">
        <div class="field"><label for={`correction-start-${day}`}>{t('correction.start')}</label><input id={`correction-start-${day}`} type="datetime-local" required value={start} onInput={(e) => setStart(e.currentTarget.value)} /></div>
        <div class="field"><label for={`correction-end-${day}`}>{t('correction.end')}</label><input id={`correction-end-${day}`} type="datetime-local" required value={end} onInput={(e) => setEnd(e.currentTarget.value)} /></div>
      </div><p class="muted">{t('correction.timeHelp')}</p>
    </> : <div class="field"><label for={`correction-amount-${day}`}>{t('correction.amount')}</label><input id={`correction-amount-${day}`} type="number" required min={-100000} max={100000} step="0.01" value={amount} onInput={(e) => setAmount(e.currentTarget.value)} /><p class="muted">{t('correction.amountHelp')}</p></div>}
    <div class="field"><label for={`correction-reason-${day}`}>{t('correction.reason')}</label><textarea id={`correction-reason-${day}`} required minLength={5} maxLength={500} value={reason} onInput={(e) => setReason(e.currentTarget.value)} /></div>
    <button type="submit" class="btn btn-primary" disabled={busy}>{t('correction.send')}</button>
    {problem ? <Banner tone="danger">{problem}</Banner> : null}
  </form>;
}
export default function CorrectionForm({ day }: { day: string }) {
  const [open, setOpen] = useState(false), [saved, setSaved] = useState(false);
  const records = useApiData<CorrectionData>(open ? '/api/corrections/me' : null);
  const own = records.data?.requests.filter((r) => r.day === day) ?? [];
  const pending = own.some((r) => r.status === 'pending');
  return <details class="correction-form details-card" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>{t('correction.request')}</summary>
    <div class="stack stack-pad">
      <div class="calendar-heading"><p class="muted">{t('correction.privacy')}</p><SpeakButton text={t('correction.privacy')} /></div>
      {saved ? <Banner tone="success">{t('correction.sent')}</Banner> : null}
      {records.error ? <ErrorMessage error={records.error} onRetry={records.reload} /> : null}
      {pending ? <p>{t('correction.pendingHelp')}</p> : null}
      {records.data && !pending ? <ProposalForm day={day} shifts={records.data.shifts} onSaved={() => { setSaved(true); records.reload(); }} /> : null}
      {own.length > 0 ? <div class="stack"><h4>{t('correction.history')}</h4>{own.map((request) => <CorrectionSummary key={request.id} request={request} />)}</div> : null}
    </div>
  </details>;
}
