import type { AttendanceMe, Me } from '../../../shared/api';
import type { FatigueFlag, Payslip, ShiftWithSummary } from '../../../shared/types';
import { Banner } from '../../components/Banner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { Icon } from '../../components/Icon';
import { SpeakButton } from '../../components/SpeakButton';
import { Spinner } from '../../components/Spinner';
import { Tile } from '../../components/Tile';
import { formatMoney, formatTime, istDay, periodLabel, t, type TKey } from '../../i18n';
import { useApiData } from '../../useApiData';
import UpcomingDaysOff from './UpcomingDaysOff';

/** Count only the part of completed shifts inside today's IST calendar day. */
export function completedHoursToday(shifts: ShiftWithSummary[], now = new Date()): number {
  const start = Date.parse(`${istDay(now.toISOString())}T00:00:00+05:30`);
  const end = start + 86_400_000;
  const ms = shifts.reduce((total, shift) => {
    if (!shift.checkOut) return total;
    return total + Math.max(0, Math.min(end, Date.parse(shift.checkOut)) - Math.max(start, Date.parse(shift.checkIn)));
  }, 0);
  return Math.round(ms / 36_000) / 100;
}

function HomeSummary({ attendance }: { attendance: AttendanceMe | undefined }) {
  const period = istDay(new Date().toISOString()).slice(0, 7);
  const pay = useApiData<Payslip>(`/api/pay/me?period=${period}`);
  return (
    <section class="home-summary" aria-label={t('home.summary')}>
      <a class="card summary-link" href="#/w/attendance">
        <span class="muted">{t('home.todayHours')}</span>
        <strong>{attendance ? t('common.hours', { hours: completedHoursToday(attendance.recent) }) : '—'}</strong>
      </a>
      <a class="card summary-link" href="#/w/pay">
        <span class="muted">{t('home.calculatedPay', { period: periodLabel(period) })}</span>
        <strong>{pay.data ? formatMoney(pay.data.net) : t(pay.error ? 'home.payUnavailable' : 'common.loading')}</strong>
      </a>
    </section>
  );
}

function FatigueBanner({ flags }: { flags: FatigueFlag[] }) {
  const lines = flags.map((flag) => t(`fatigue.${flag.rule}` as TKey, flag.detail));
  const spoken = [t('fatigue.title'), ...lines].join('. ');
  return (
    <Banner tone="warn" title={t('fatigue.title')}>
      <ul class="plain-list">
        {lines.map((line, index) => (
          <li key={`${flags[index]?.rule}-${index}`}>{line}</li>
        ))}
      </ul>
      <div class="row">
        <SpeakButton text={spoken} />
      </div>
    </Banner>
  );
}

export default function Home({ me }: { me: Me }) {
  const attendance = useApiData<AttendanceMe>('/api/attendance/me');
  const data = attendance.data;
  const open = data?.open ?? null;
  const statusText = open ? t('attendance.openSince', { time: formatTime(open.checkIn) }) : t('home.notCheckedIn');

  return (
    <div class="stack">
      <section class="card greeting" aria-labelledby="home-title">
        <div>
          <h1 id="home-title" class="greeting-name">
            {t('home.hello', { name: me.name })}
          </h1>
          <p class="muted">{me.jobTitle}</p>
          <p class="muted">{t('home.site', { site: me.site.name })}</p>
        </div>

        {/* Status and the check-in button share one row, wrapping onto two on narrow screens. */}
        <div class="greeting-actions">
          {data ? (
            <div class="status-row">
              <span class={`status-chip${open ? ' is-in' : ''}`}>
                <span class="status-dot" aria-hidden="true" />
                {statusText}
              </span>
              <SpeakButton text={statusText} />
            </div>
          ) : null}
          <a class="btn btn-primary" href="#/w/attendance">
            <Icon name="checkin" size={20} />
            {t(open ? 'attendance.checkOut' : 'attendance.checkIn')}
          </a>
        </div>
      </section>

      {attendance.loading && !data ? <Spinner /> : null}
      {attendance.error ? <ErrorMessage error={attendance.error} onRetry={attendance.reload} /> : null}
      {data && data.fatigue.length > 0 ? <FatigueBanner flags={data.fatigue} /> : null}
      <HomeSummary attendance={data} />
      <UpcomingDaysOff />

      <section class="stack" aria-labelledby="menu-title">
        <h2 id="menu-title">{t('home.menu')}</h2>
        <div class="tile-grid">
          <Tile href="#/w/attendance" icon="checkin" label={t('home.tile.checkin')} />
          <Tile href="#/w/pay" icon="pay" label={t('home.tile.pay')} />
          <Tile href="#/w/report" icon="report" label={t('home.tile.report')} />
          <Tile href="#/w/skills" icon="skills" label={t('home.tile.skills')} />
          <Tile href="#/w/feedback" icon="feedback" label={t('home.tile.feedback')} />
        </div>
      </section>
    </div>
  );
}
