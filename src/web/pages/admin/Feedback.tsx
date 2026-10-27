import type { AdminFeedback } from '../../../shared/api';
import type { FeedbackRatings } from '../../../shared/types';
import { Banner } from '../../components/Banner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { Spinner } from '../../components/Spinner';
import { t, type TKey } from '../../i18n';
import { useApiData } from '../../useApiData';
import { oneDecimal } from './shared';

const DIMENSIONS: Array<{ key: keyof FeedbackRatings; label: TKey }> = [
  { key: 'safety', label: 'admin.feedback.safety' },
  { key: 'fairness', label: 'admin.feedback.fairness' },
  { key: 'respect', label: 'admin.feedback.respect' },
  { key: 'workload', label: 'admin.feedback.workload' },
];

function isInsufficient(value: AdminFeedback): value is { insufficient: true; count: number } {
  return 'insufficient' in value && value.insufficient === true;
}

export default function Feedback() {
  const feedback = useApiData<AdminFeedback>('/api/admin/feedback');
  const data = feedback.data;

  return (
    <div class="stack">
      <h1>{t('admin.feedback.title')}</h1>
      <p class="muted">{t('admin.feedback.anonymous')}</p>

      {feedback.loading && !data ? <Spinner /> : null}
      {feedback.error ? <ErrorMessage error={feedback.error} onRetry={feedback.reload} /> : null}

      {data && isInsufficient(data) ? (
        <Banner tone="info">{t('admin.feedback.insufficient', { count: data.count })}</Banner>
      ) : null}

      {data && !isInsufficient(data) ? (
        <>
          <p>{t('admin.feedback.count', { count: data.count })}</p>

          <section class="card stack" aria-label={t('admin.feedback.title')}>
            {DIMENSIONS.map(({ key, label }) => {
              const average = data.averages[key];
              const percent = Math.max(0, Math.min(100, (average / 5) * 100));
              return (
                <div class="bar-row" key={key}>
                  <span class="field-label">{t(label)}</span>
                  <div class="bar-track" aria-hidden="true">
                    <div class="bar-fill" style={{ width: `${percent}%` }} />
                  </div>
                  <span>{t('admin.feedback.outOf', { score: oneDecimal(average) })}</span>
                </div>
              );
            })}
          </section>

          <section class="stack" aria-labelledby="comments-title">
            <h2 id="comments-title">{t('admin.feedback.comments')}</h2>
            {data.comments.length === 0 ? (
              <p class="muted">{t('admin.feedback.noComments')}</p>
            ) : (
              <ul class="entries">
                {data.comments.map((comment, index) => (
                  <li key={index}>{comment}</li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
