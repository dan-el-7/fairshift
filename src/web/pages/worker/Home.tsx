import type { AttendanceMe, Me } from '../../../shared/api';
import type { FatigueFlag } from '../../../shared/types';
import { Banner } from '../../components/Banner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { SpeakButton } from '../../components/SpeakButton';
import { Spinner } from '../../components/Spinner';
import { Tile } from '../../components/Tile';
import { formatTime, t, type TKey } from '../../i18n';
import { useApiData } from '../../useApiData';

function FatigueBanner({ flags }: { flags: FatigueFlag[] }) {
  const lines = flags.map((flag) => t(`fatigue.${flag.rule}` as TKey, flag.detail));
  const spoken = [t('fatigue.title'), ...lines].join('. ');
  return (
    <Banner tone="warn" title={t('fatigue.title')}>
      <ul class="lines">
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

  return (
    <div class="stack">
      <section class="stack" aria-labelledby="home-title">
        <h1 id="home-title">{t('home.hello', { name: me.name })}</h1>
        <p class="muted">{t('home.site', { site: me.site.name })}</p>
      </section>

      {attendance.loading && !data ? <Spinner /> : null}
      {attendance.error ? <ErrorMessage error={attendance.error} onRetry={attendance.reload} /> : null}

      {data ? (
        <div class="card row">
          <p class="big">
            {data.open ? t('home.checkedIn', { time: formatTime(data.open.checkIn) }) : t('home.notCheckedIn')}
          </p>
          <SpeakButton text={data.open ? t('home.checkedIn', { time: formatTime(data.open.checkIn) }) : t('home.notCheckedIn')} />
        </div>
      ) : null}

      {data && data.fatigue.length > 0 ? <FatigueBanner flags={data.fatigue} /> : null}

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
