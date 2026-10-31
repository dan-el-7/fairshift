import type { Payslip } from '../../../shared/types';
import { ErrorMessage } from '../../components/ErrorMessage';
import { SpeakButton } from '../../components/SpeakButton';
import { formatMoney, istDay, periodLabel, t, type TKey } from '../../i18n';
import { useApiData } from '../../useApiData';

export function previousPeriod(month: string): string {
  const date = new Date(`${month}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() - 1);
  return date.toISOString().slice(0, 7);
}
const signed = (amount: number) => `${amount > 0 ? '+' : ''}${formatMoney(amount)}`;
const line = (slip: Payslip, key: string) => slip.lines.filter((l) => l.key === key).reduce((sum, l) => sum + l.amount, 0);
const adjustment = (slip: Payslip) => slip.adjustments?.reduce((sum, a) => sum + a.amount, 0) ?? 0;
export function comparisonRows(current: Payslip, previous: Payslip): [TKey, number][] {
  return [
    ['comparison.base', line(current, 'pay.base') - line(previous, 'pay.base')],
    ['comparison.overtime', line(current, 'pay.overtime') - line(previous, 'pay.overtime')],
    ['comparison.night', line(current, 'pay.night') - line(previous, 'pay.night')],
    ['comparison.deductions', previous.deductions - current.deductions],
    ['comparison.adjustments', adjustment(current) - adjustment(previous)],
  ];
}
export default function PayComparison({ slip }: { slip: Payslip }) {
  const month = previousPeriod(slip.period.id);
  const previous = useApiData<Payslip>(`/api/pay/me?period=${month}`);
  if (previous.error) return <ErrorMessage error={previous.error} onRetry={previous.reload} />;
  if (previous.data?.period.id !== month) return null;
  const before = previous.data, rows = comparisonRows(slip, before), delta = slip.net - before.net;
  const help = t(slip.period.id === istDay(new Date().toISOString()).slice(0, 7) ? 'comparison.partial' : 'comparison.full');
  const speech = `${t('comparison.title', { month: periodLabel(month) })}. ${t('comparison.change')}: ${signed(delta)}. ${help} ${rows.map(([key, amount]) => `${t(key)}: ${signed(amount)}.`).join(' ')}`;
  return <details class="card details-card pay-comparison">
    <summary class="training-summary"><span>{t('comparison.title', { month: periodLabel(month) })}</span><strong class="amount">{signed(delta)}</strong></summary>
    <div class="stack stack-pad">
      <div class="calendar-heading"><p class="muted">{help}</p><SpeakButton text={speech} /></div>
      {before.summary.hours === 0 ? <p class="muted">{t('comparison.noWork')}</p> : null}
      <div class="total-row"><span>{periodLabel(month)}</span><strong class="amount">{formatMoney(before.net)}</strong></div>
      <dl class="daily-amounts">{rows.map(([key, amount]) => <div key={key}><dt>{t(key)}</dt><dd>{signed(amount)}</dd></div>)}</dl>
      <div class="total-row"><strong>{t('comparison.change')}</strong><strong class="amount">{signed(delta)}</strong></div>
      <p class="muted">{t('comparison.help')}</p>
    </div>
  </details>;
}
