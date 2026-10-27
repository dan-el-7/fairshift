import type { AttendanceMe, Me } from '../../../shared/api';
import type { FatigueFlag } from '../../../shared/types';
import { Banner } from '../../components/Banner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { Icon } from '../../components/Icon';
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

        {data ? (
          <div class="status-row">
            <span class={`status-chip${open ? ' is-in' : ''}`}>
              <span class="status-dot" aria-hidden="true" />
              {statusText}
            </span>
            <SpeakButton text={statusText} />
          </div>
        ) : null}

        <div>
          <a class="btn btn-primary" href="#/w/attendance">
            <Icon name="checkin" size={20} />
            {t('home.tile.checkin')}
          </a>
        </div>
      </section>

      {attendance.loading && !data ? <Spinner /> : null}
      {attendance.error ? <ErrorMessage error={attendance.error} onRetry={attendance.reload} /> : null}
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
