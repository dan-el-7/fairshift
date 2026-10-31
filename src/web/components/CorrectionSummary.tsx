import type { CorrectionRequest } from '../../shared/types';
import { formatDay, formatMoney, formatTime, istDay, t } from '../i18n';
import { SpeakButton } from './SpeakButton';

export function correctionText(request: CorrectionRequest): string {
  const proposed = request.kind === 'pay' ? formatMoney(request.amount ?? 0)
    : `${request.checkIn ? formatTime(request.checkIn) : ''} → ${request.checkOut ? formatDay(istDay(request.checkOut)) + ' ' + formatTime(request.checkOut) : ''}`;
  return `${formatDay(request.day)}. ${t(request.kind === 'pay' ? 'correction.pay' : 'correction.shift')}: ${proposed}. ${request.reason}. ${t(`correction.${request.status}`)}. ${request.reviewReason ?? ''}`;
}
export function CorrectionSummary({ request }: { request: CorrectionRequest }) {
  return <div class="stack correction-summary">
    <div class="calendar-heading"><strong>{formatDay(request.day)} · {t(request.kind === 'pay' ? 'correction.pay' : 'correction.shift')}</strong><SpeakButton text={correctionText(request)} /></div>
    <span class={`tag correction-status status-${request.status}`}>{t(`correction.${request.status}`)}</span>
    <p>{request.reason}</p>
    {request.kind === 'pay' ? <p>{t('correction.requestedChange')}: <strong>{formatMoney(request.amount ?? 0)}</strong></p>
      : <p>{t('correction.proposed')}: {request.checkIn ? formatTime(request.checkIn) : '—'} → {request.checkOut ? formatDay(istDay(request.checkOut)) + ' ' + formatTime(request.checkOut) : '—'}</p>}
    {request.originalShift ? <p class="muted">{t('correction.original')}: {formatTime(request.originalShift.checkIn)} → {request.originalShift.checkOut ? formatTime(request.originalShift.checkOut) : '—'}</p> : null}
    {request.reviewReason ? <p class="muted">{request.reviewer}: {request.reviewReason}</p> : null}
  </div>;
}
