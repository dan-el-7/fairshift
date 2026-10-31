import { useState } from 'preact/hooks';
import type { DailyPay, PayCalendar as CalendarData } from '../../../shared/types';
import { ErrorMessage } from '../../components/ErrorMessage';
import { SpeakButton } from '../../components/SpeakButton';
import { Spinner } from '../../components/Spinner';
import { formatDay, formatMoney, periodLabel, t, type TKey, useLang } from '../../i18n';
import { useApiData } from '../../useApiData';
import CorrectionForm from './CorrectionForm';

export function dayStatus(day: DailyPay, today: string): string {
  if (day.day > today) return t('calendar.upcoming');
  if (day.open) return t('attendance.inProgress');
  return t(day.summary.hours > 0 ? 'calendar.worked' : 'calendar.noShift');
}

export function dailyPaySpeech(day: DailyPay, today: string): string {
  const intro = `${formatDay(day.day)}. ${dayStatus(day, today)}. ${day.dayOff ? `${t('calendar.off')}: ${day.dayOff}. ${t('calendar.scheduleHelp')} ` : ''}`;
  if (day.summary.hours === 0 && !day.adjustment) return `${intro}${t(day.day > today ? 'calendar.futureHelp' : day.open ? 'calendar.openHelp' : 'calendar.emptyHelp')}`;
  return `${intro}${t('calendar.dailySpeech', {
    hours: day.summary.hours, overtimeHours: day.summary.overtimeHours,
    base: formatMoney(day.base), overtime: formatMoney(day.overtime), night: formatMoney(day.night),
    pf: formatMoney(day.pf), esi: formatMoney(day.esi), net: formatMoney(day.net),
  })} ${day.adjustment ? t('correction.netChange') + ': ' + formatMoney(day.adjustment) + '. ' : ''}${t('calendar.estimateHelp')}`;
}

function DayDetail({ day, today }: { day: DailyPay; today: string }) {
  const amounts: [TKey, number][] = [
    ['calendar.base', day.base], ['calendar.overtime', day.overtime], ['calendar.night', day.night],
    ['calendar.pf', -day.pf], ['calendar.esi', -day.esi],
    ...(day.adjustment ? [['correction.netChange', day.adjustment] as [TKey, number]] : []),
  ];
  return (
    <section class="card stack daily-pay" aria-labelledby="daily-title">
      <div class="calendar-heading">
        <div><p class="eyebrow">{t('calendar.selected')}</p><h3 id="daily-title">{formatDay(day.day)}</h3></div>
        <SpeakButton text={dailyPaySpeech(day, today)} />
      </div>
      <div class="row"><span class="tag">{dayStatus(day, today)}</span>{day.dayOff ? <span class="tag day-off-tag">{t('calendar.off')}: {day.dayOff}</span> : null}</div>
      <p class="muted">{t('calendar.hours', { hours: day.summary.hours, overtime: day.summary.overtimeHours })}</p>
      {day.day <= today && (day.summary.hours > 0 || day.adjustment) ? <>
        <dl class="daily-amounts">{amounts.map(([label, amount]) => <div key={label}><dt>{t(label)}</dt><dd>{formatMoney(amount)}</dd></div>)}</dl>
        <div class="total-row"><strong>{t('calendar.net')}</strong><strong class="amount">{formatMoney(day.net)}</strong></div>
      </> : <p class="muted">{t(day.day > today ? 'calendar.futureHelp' : day.open ? 'calendar.openHelp' : 'calendar.emptyHelp')}</p>}
      {day.dayOff ? <p class="muted">{t('calendar.scheduleHelp')}</p> : null}
      {day.day <= today ? <CorrectionForm key={day.day} day={day.day} /> : null}
    </section>
  );
}

export default function PayCalendar({ period }: { period: string }) {
  const lang = useLang();
  const calendar = useApiData<CalendarData>(`/api/pay/calendar?period=${encodeURIComponent(period)}`);
  const [selected, setSelected] = useState<string | null>(null);
  const data = calendar.data?.month === period ? calendar.data : undefined;
  const day = data?.days.find((d) => d.day === selected)
    ?? data?.days.find((d) => d.day === data.today)
    ?? data?.days.filter((d) => d.summary.hours > 0).at(-1)
    ?? data?.days[0];
  const offset = new Date(`${period}-01T00:00:00Z`).getUTCDay();
  const weekdays = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(`${lang}-IN`, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 10, 1 + i))));
  return <div class="stack pay-calendar">
    {calendar.loading && !data ? <Spinner /> : null}
    {calendar.error ? <ErrorMessage error={calendar.error} onRetry={calendar.reload} /> : null}
    {data && day ? <>
      <section class="card stack calendar-month" aria-labelledby="calendar-title">
        <div class="calendar-heading"><h2 id="calendar-title">{periodLabel(period)}</h2><SpeakButton text={t('calendar.help')} /></div>
        <p class="muted">{t('calendar.help')}</p>
        <div class="calendar-grid" role="group" aria-label={t('calendar.title')}>
          {weekdays.map((label, i) => <span key={`weekday-${i}`} class="calendar-weekday" aria-hidden="true">{label}</span>)}
          {Array.from({ length: offset }, (_, i) => <span key={`pad-${i}`} aria-hidden="true" />)}
          {data.days.map((item) => <button key={item.day} type="button"
            class={`calendar-day${item.summary.hours > 0 ? ' has-work' : ''}${item.dayOff ? ' is-off' : ''}`}
            aria-pressed={day.day === item.day} aria-current={item.day === data.today ? 'date' : undefined}
            aria-label={`${formatDay(item.day)}. ${dayStatus(item, data.today)}${item.dayOff ? `. ${t('calendar.off')}: ${item.dayOff}` : ''}`}
            onClick={() => setSelected(item.day)}>
            <span>{Number(item.day.slice(-2))}</span><span class="calendar-mark" aria-hidden="true">{item.dayOff ? '−' : item.summary.hours > 0 ? '•' : ''}</span>
          </button>)}
        </div>
        <div class="calendar-legend muted"><span><i class="work-dot" />{t('calendar.worked')}</span><span><i class="off-dot" />{t('calendar.off')}</span></div>
      </section>
      <DayDetail day={day} today={data.today} />
      <section class="card stack calendar-notes">
        <h3>{t('calendar.estimate')}</h3><p class="muted">{t('calendar.estimateHelp')}</p>
        <p class="muted">{t('calendar.dateHelp')}</p>
        <div class="total-row"><span>{t('calendar.adjustment')}</span><span class="amount">{formatMoney(data.monthlyAdjustment)}</span></div>
        <p class="muted">{t('calendar.adjustmentHelp')}</p>
      </section>
    </> : null}
  </div>;
}
