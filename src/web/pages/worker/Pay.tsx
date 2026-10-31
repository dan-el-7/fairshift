import { useMemo, useState } from 'preact/hooks';
import type { Me } from '../../../shared/api';
import type { Language, PayLine, Payslip } from '../../../shared/types';
import { INDUSTRIES } from '../../../shared/industries';
import { ApiError } from '../../api';
import { copyText } from '../../clipboard';
import { Banner } from '../../components/Banner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { Icon } from '../../components/Icon';
import { Spinner } from '../../components/Spinner';
import { formatMoney, periodLabel, t, type Params, type TKey, useLang } from '../../i18n';
import { speak } from '../../speech';
import { useApiData } from '../../useApiData';
import PayCalendar from './PayCalendar';
import PayComparison from './PayComparison';
import PayAdjustments from './PayAdjustments';
import { useRoute } from '../../router';
import PaymentSummary from './PaymentSummary';

/** Parameters that hold paise and must be shown as money. Every other number is shown as-is. */
const MONEY_PARAMS = new Set(['rate', 'amount', 'gross', 'base', 'advance', 'net', 'deductions', 'cap', 'wage', 'salary', 'dayRate']);

function displayParams(params: Record<string, number>): Params {
  const out: Params = {};
  for (const [name, value] of Object.entries(params)) {
    out[name] = MONEY_PARAMS.has(name) ? formatMoney(value) : value;
  }
  return out;
}

/** Template text for one payslip line, e.g. "22 days × ₹750.00". */
export function payLineLabel(line: PayLine, payModel: 'daily' | 'monthly'): string {
  const key = line.key === 'pay.base' ? (`pay.base.${payModel}` as TKey) : (line.key as TKey);
  return t(key, displayParams(line.params));
}

/** The whole payslip as one spoken passage in the current language. */
export function payslipSpeech(slip: Payslip, payModel: 'daily' | 'monthly'): string {
  const lines = slip.lines
    .map((line) => t('pay.speech.line', { label: payLineLabel(line, payModel), amount: formatMoney(line.amount) }))
    .join('');
  const totals = t('pay.speech.totals', {
    gross: formatMoney(slip.gross),
    deductions: formatMoney(slip.deductions),
    net: formatMoney(slip.net),
  });
  const adjustments = slip.adjustments?.map((a) => `${t('correction.netChange')}: ${formatMoney(a.amount)}. ${a.reason}. `).join('') ?? '';
  return `${t('pay.speech.intro', { period: periodLabel(slip.period.id) })}${lines}${adjustments}${totals}`;
}

/** The last `count` pay periods (YYYY-MM), newest first, counted in IST. */
export function recentPeriods(count: number, now: Date = new Date()): string[] {
  const ist = new Date(now.getTime() + 330 * 60 * 1000);
  let year = ist.getUTCFullYear();
  let month = ist.getUTCMonth() + 1;
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(`${year}-${String(month).padStart(2, '0')}`);
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }
  return out;
}

function LineList({ lines, payModel, deduction }: { lines: PayLine[]; payModel: 'daily' | 'monthly'; deduction: boolean }) {
  if (lines.length === 0) return null;
  return (
    <ul class="lines">
      {lines.map((line, index) => (
        <li key={`${line.key}-${index}`}>
          <span class="lines-text">{payLineLabel(line, payModel)}</span>
          <span class="amount">
            {deduction && line.amount !== 0 ? '−' : ''}
            {formatMoney(line.amount)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function linesOf(slip: Payslip | undefined, kind: PayLine['kind']): PayLine[] {
  return slip?.lines.filter((line) => line.kind === kind) ?? [];
}

function PayActions({ me, slip, payModel }: { me: Me; slip: Payslip; payModel: 'daily' | 'monthly' }) {
  const [shareNotice, setShareNotice] = useState<'copied' | 'failed' | null>(null);
  async function share() {
    setShareNotice(null);
    const text = `${me.name} · ${me.site.name}\n${payslipSpeech(slip, payModel)}\n${t('pay.calculated')}`;
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: t('pay.shareTitle', { month: periodLabel(slip.period.id) }), text });
      } else setShareNotice(await copyText(text) ? 'copied' : 'failed');
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) setShareNotice('failed');
    }
  }
  return <>
    <div class="pay-actions">
      <button type="button" class="btn" aria-label={t('pay.print')} title={t('pay.print')} onClick={() => window.print()}><Icon name="file" size={20} />{t('pay.printShort')}</button>
      <button type="button" class="btn" aria-label={t('pay.share')} title={t('pay.share')} onClick={() => void share()}><Icon name="share" size={20} />{t('pay.shareShort')}</button>
    </div>
    {shareNotice ? <Banner tone={shareNotice === 'copied' ? 'success' : 'danger'}>{t(shareNotice === 'copied' ? 'pay.copied' : 'pay.shareFailed')}</Banner> : null}
  </>;
}

export default function Pay({ me }: { me: Me }) {
  const { query } = useRoute();
  const lang: Language = useLang();
  const periods = useMemo(() => recentPeriods(6), []);
  const [period, setPeriod] = useState<string>(periods[0] ?? '');
  const [view, setView] = useState<'slip' | 'calendar'>(() => query.get('view') === 'calendar' ? 'calendar' : 'slip');
  const calendarClass = view === 'calendar' ? ' is-calendar' : '';
  const payslip = useApiData<Payslip>(`/api/pay/me?period=${encodeURIComponent(period)}`);
  const payModel = INDUSTRIES[me.site.industry].payModel;
  const slip = payslip.data?.period.id === period ? payslip.data : undefined;
  const earnings = linesOf(slip, 'earning');
  const deductions = linesOf(slip, 'deduction');
  const noPayslip = payslip.error instanceof ApiError && payslip.error.status === 404;

  return (
    <div class="stack pay-page">
      <h1>{t('pay.title')}</h1>
      <div class="pay-print-heading"><strong>{me.name}</strong><p>{me.site.name}</p></div>

      <div class="field">
        <label class="field-label" for="pay-period">
          {t('pay.month')}
        </label>
        <select id="pay-period" value={period} onChange={(event) => setPeriod(event.currentTarget.value)}>
          {periods.map((id) => (
            <option key={id} value={id}>
              {periodLabel(id)}
            </option>
          ))}
        </select>
      </div>

      {payslip.loading && !slip ? <Spinner /> : null}
      {noPayslip ? <Banner tone="info">{t('pay.noPayslip')}</Banner> : null}
      {payslip.error && !noPayslip ? <ErrorMessage error={payslip.error} onRetry={payslip.reload} /> : null}

      {slip ? (
        <>
          <div class="segmented pay-view" role="group" aria-label={t('pay.view')}>
            <button type="button" aria-pressed={view === 'slip'} onClick={() => setView('slip')}><Icon name="file" size={20} />{t('pay.payslip')}</button>
            <button type="button" aria-pressed={view === 'calendar'} onClick={() => setView('calendar')}><Icon name="calendar" size={20} />{t('calendar.title')}</button>
          </div>
          {/* Take-home pay first: the number a worker looks for, then the breakdown that explains it. */}
          <section class={`card net-panel pay-monthly${calendarClass}`} aria-labelledby="net-title">
            <h2 id="net-title" class="visually-hidden">
              {t('pay.net')}
            </h2>
            <div class="total-net">
              <span>{t('pay.net')}</span>
              <span class="money-net">{formatMoney(slip.net)}</span>
            </div>
            <hr class="net-divider" />
            <button type="button" class="btn btn-block net-read" onClick={() => speak(payslipSpeech(slip, payModel), lang)}>
              <Icon name="speaker" size={20} />
              {t('pay.readAll')}
            </button>
          </section>

          <PayActions key={period} me={me} slip={slip} payModel={payModel} />
          <div class={`pay-comparison-wrap${calendarClass}`}><PayComparison key={period} slip={slip} /></div>
          <p class={`muted pay-calculated${calendarClass}`}>{t('pay.calculated')}</p>

          {view === 'calendar' ? <PayCalendar key={period} period={period} /> : null}

          <section class={`card receipt pay-receipt${calendarClass}`} aria-labelledby="period-title">
            <div class="receipt-head">
              <h2 id="period-title">{periodLabel(slip.period.id)}</h2>
              <p class="muted">
                {payModel === 'daily' ? `${t('pay.daysWorked', { days: slip.summary.daysWorked })} · ` : ''}
                {t('pay.hoursWorked', { hours: slip.summary.hours })}
              </p>
            </div>

            <section class="stack" aria-labelledby="earn-title">
              <h3 id="earn-title">{t('pay.earnings')}</h3>
              <LineList lines={earnings} payModel={payModel} deduction={false} />
              <div class="total-row">
                <span>{t('pay.gross')}</span>
                <span class="amount">{formatMoney(slip.gross)}</span>
              </div>
            </section>

            <section class="stack" aria-labelledby="deduct-title">
              <h3 id="deduct-title">{t('pay.deductionsHeading')}</h3>
              <LineList lines={deductions} payModel={payModel} deduction />
              <div class="total-row">
                <span>{t('pay.deductions')}</span>
                <span class="amount">{formatMoney(slip.deductions)}</span>
              </div>
            </section>
            <PayAdjustments slip={slip} />
          </section>
          <PaymentSummary key={`payment-${period}`} period={period} />

        </>
      ) : null}
    </div>
  );
}
