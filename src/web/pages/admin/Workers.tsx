import { useState } from 'preact/hooks';
import type { WorkerSummary } from '../../../shared/api';
import type { PassportEntry, PassportKind } from '../../../shared/types';
import { api, errorMessage } from '../../api';
import { Banner } from '../../components/Banner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { Spinner } from '../../components/Spinner';
import { t, type TKey } from '../../i18n';
import { useApiData } from '../../useApiData';

const KINDS: PassportKind[] = ['training', 'certification', 'experience'];

/** Adds one skill or training entry to a worker's passport. */
function PassportForm({ worker }: { worker: WorkerSummary }) {
  const [kind, setKind] = useState<PassportKind>('training');
  const [title, setTitle] = useState('');
  const [hours, setHours] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const base = `passport-${worker.id}`;

  async function submit(event: Event) {
    event.preventDefault();
    setMessage(null);
    setProblem(null);
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setProblem(t('admin.passport.titleRequired'));
      return;
    }
    const hoursValue = hours.trim() === '' ? undefined : Number(hours);
    if (hoursValue !== undefined && (!Number.isFinite(hoursValue) || hoursValue < 0)) {
      setProblem(t('admin.passport.hoursInvalid'));
      return;
    }
    setBusy(true);
    try {
      const body: { workerId: string; kind: PassportKind; title: string; hours?: number } = {
        workerId: worker.id,
        kind,
        title: cleanTitle,
      };
      if (hoursValue !== undefined) body.hours = hoursValue;
      const entry = await api.post<PassportEntry>('/api/admin/passport', body);
      setMessage(t('admin.passport.added', { title: entry.title, name: worker.name }));
      setTitle('');
      setHours('');
    } catch (err) {
      setProblem(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form class="stack" onSubmit={submit}>
      <div class="field">
        <label class="field-label" for={`${base}-kind`}>
          {t('admin.passport.kind')}
        </label>
        <select id={`${base}-kind`} value={kind} onChange={(event) => setKind((event.currentTarget as HTMLSelectElement).value as PassportKind)}>
          {KINDS.map((value) => (
            <option key={value} value={value}>
              {t(`passport.kind.${value}` as TKey)}
            </option>
          ))}
        </select>
      </div>
      <div class="field">
        <label class="field-label" for={`${base}-title`}>
          {t('admin.passport.titleLabel')}
        </label>
        <input
          id={`${base}-title`}
          type="text"
          required
          maxLength={120}
          value={title}
          onInput={(event) => setTitle((event.currentTarget as HTMLInputElement).value)}
        />
      </div>
      <div class="field">
        <label class="field-label" for={`${base}-hours`}>
          {t('admin.passport.hoursLabel')}
        </label>
        <input
          id={`${base}-hours`}
          type="number"
          min={0}
          step={0.5}
          inputMode="decimal"
          value={hours}
          onInput={(event) => setHours((event.currentTarget as HTMLInputElement).value)}
        />
      </div>
      <button type="submit" class="btn btn-primary" disabled={busy}>
        {t('admin.passport.submit')}
      </button>
      {problem ? <Banner tone="danger">{problem}</Banner> : null}
      {message ? <Banner tone="success">{message}</Banner> : null}
    </form>
  );
}

export default function Workers() {
  const workers = useApiData<WorkerSummary[]>('/api/admin/workers');
  const list = workers.data ?? [];

  return (
    <div class="stack">
      <h1>{t('admin.workers.title')}</h1>

      {workers.loading && !workers.data ? <Spinner /> : null}
      {workers.error ? <ErrorMessage error={workers.error} onRetry={workers.reload} /> : null}
      {workers.data && list.length === 0 ? <p>{t('admin.workers.empty')}</p> : null}

      {list.length > 0 ? (
        <>
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th scope="col">{t('admin.col.name')}</th>
                  <th scope="col">{t('admin.col.job')}</th>
                  <th scope="col">{t('admin.col.hours')}</th>
                  <th scope="col">{t('admin.col.overtimeHours')}</th>
                  <th scope="col">{t('admin.col.fatigue')}</th>
                  <th scope="col">{t('admin.col.risk')}</th>
                </tr>
              </thead>
              <tbody>
                {list.map((worker) => (
                  <tr key={worker.id}>
                    <th scope="row">{worker.name}</th>
                    <td>{worker.jobTitle}</td>
                    <td class="num">{t('common.hours', { hours: worker.hours14d })}</td>
                    <td class="num">{t('common.hours', { hours: worker.overtime14d })}</td>
                    <td class="num">{worker.fatigue.length}</td>
                    <td>
                      <span class={`badge badge-${worker.quitRisk.level}`}>{t(`risk.level.${worker.quitRisk.level}` as TKey)}</span>{' '}
                      <span>{t('admin.riskScore', { score: worker.quitRisk.score })}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div class="stack">
            {list.map((worker) => (
              <details key={worker.id} class="card details-card">
                <summary>{t('admin.passport.summary', { name: worker.name })}</summary>
                <div class="stack-pad">
                  <PassportForm worker={worker} />
                </div>
              </details>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
