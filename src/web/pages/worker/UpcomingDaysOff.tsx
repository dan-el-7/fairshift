import type { DayOff } from '../../../shared/types';
import { ErrorMessage } from '../../components/ErrorMessage';
import { Icon } from '../../components/Icon';
import { SpeakButton } from '../../components/SpeakButton';
import { Spinner } from '../../components/Spinner';
import { formatDay, t } from '../../i18n';
import { useApiData } from '../../useApiData';

interface ScheduleResponse {
  today: string;
  days: DayOff[];
}

export default function UpcomingDaysOff() {
  const schedule = useApiData<ScheduleResponse>('/api/schedule/me');
  const days = schedule.data?.days.slice(0, 3) ?? [];
  const spoken = days.map((day) => `${formatDay(day.day)}: ${day.label}`).join('. ');

  return (
    <section class="card stack" aria-labelledby="days-off-title">
      <div class="calendar-heading">
        <h2 id="days-off-title"><Icon name="calendar" size={20} /> {t('home.daysOff.title')}</h2>
        {schedule.data ? <SpeakButton text={`${t('home.daysOff.title')}. ${days.length ? spoken : t('home.daysOff.empty')}. ${t('home.daysOff.notice')}`} /> : null}
      </div>
      <p class="muted">{t('home.daysOff.notice')}</p>
      {schedule.loading && !schedule.data ? <Spinner /> : null}
      {schedule.error ? <ErrorMessage error={schedule.error} onRetry={schedule.reload} /> : null}
      {schedule.data && days.length === 0 ? <p class="muted">{t('home.daysOff.empty')}</p> : null}
      {days.length ? (
        <ul class="days-off-list">
          {days.map((day) => <li key={day.day}><span><strong>{formatDay(day.day)}</strong><br />{day.label}</span></li>)}
        </ul>
      ) : null}
      <a class="days-off-link" href="#/w/pay?view=calendar"><Icon name="calendar" size={18} /><span>{t('home.daysOff.calendar')}</span></a>
    </section>
  );
}
