import { useState } from 'preact/hooks';
import type { DayOff } from '../../../shared/types';
import { api, errorMessage } from '../../api';
import { Banner } from '../../components/Banner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { SpeakButton } from '../../components/SpeakButton';
import { formatDay, t } from '../../i18n';
import { useApiData } from '../../useApiData';

export default function DaysOff() {
  const days = useApiData<DayOff[]>('/api/admin/days-off');
  const [day, setDay] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  async function save(record: { day: string; label: string; active: boolean }) {
    setBusy(true); setProblem(null); setSaved(false);
    try {
      await api.post<DayOff>('/api/admin/days-off', record);
      days.reload(); setSaved(true);
      if (record.active) { setDay(''); setLabel(''); }
    } catch (error) { setProblem(errorMessage(error)); }
    finally { setBusy(false); }
  }
  return <section class="stack" aria-labelledby="days-off-title">
    <div class="calendar-heading"><h2 id="days-off-title">{t('calendar.adminTitle')}</h2><SpeakButton text={t('calendar.scheduleHelp')} /></div>
    <p class="muted">{t('calendar.adminHelp')}</p>
    <form class="stack" onSubmit={(event) => { event.preventDefault(); if (day && label.trim()) void save({ day, label: label.trim(), active: true }); }}>
      <div class="days-off-fields">
        <div class="field"><label class="field-label" for="off-date">{t('calendar.date')}</label><input id="off-date" type="date" required value={day} onInput={(event) => setDay(event.currentTarget.value)} /></div>
        <div class="field"><label class="field-label" for="off-label">{t('calendar.label')}</label><input id="off-label" required maxLength={100} value={label} onInput={(event) => setLabel(event.currentTarget.value)} /></div>
      </div>
      <button class="btn" type="submit" disabled={busy}>{t('calendar.markOff')}</button>
    </form>
    {problem ? <Banner tone="danger">{problem}</Banner> : null}
    {saved ? <Banner tone="success">{t('calendar.saved')}</Banner> : null}
    {days.error ? <ErrorMessage error={days.error} onRetry={days.reload} /> : null}
    {days.data?.length === 0 ? <p class="muted">{t('calendar.noOffs')}</p> : null}
    <ul class="days-off-list">{days.data?.map((off) => <li key={off.day}><span><strong>{formatDay(off.day)}</strong><br />{off.label}</span><button type="button" class="btn" disabled={busy} aria-label={`${t('calendar.remove')}: ${formatDay(off.day)}, ${off.label}`} onClick={() => void save({ ...off, active: false })}>{t('calendar.remove')}</button></li>)}</ul>
  </section>;
}
