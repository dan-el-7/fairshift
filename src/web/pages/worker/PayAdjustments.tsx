import type { Payslip } from '../../../shared/types';
import { formatDay, formatMoney, t } from '../../i18n';
export default function PayAdjustments({ slip }: { slip: Payslip }) {
  if (!slip.adjustments?.length) return null;
  return <section class="stack" aria-labelledby="adjustments-title">
    <h3 id="adjustments-title">{t('correction.adjustments')}</h3><p class="muted">{t('correction.netHelp')}</p>
    <ul class="lines">{slip.adjustments.map((a, index) => <li key={index}><span class="lines-text">{formatDay(a.day)} · {a.reason}</span><strong class="amount">{formatMoney(a.amount)}</strong></li>)}</ul>
  </section>;
}
