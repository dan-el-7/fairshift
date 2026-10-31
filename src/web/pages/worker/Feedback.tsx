import { LanguageNudge } from '../../components/LanguageNudge';
import { useState } from 'preact/hooks';
import type { FeedbackRequest, Me } from '../../../shared/api';
import type { FeedbackRatings } from '../../../shared/types';
import { ApiError, api, errorMessage } from '../../api';
import { Banner } from '../../components/Banner';
import { SpeakButton } from '../../components/SpeakButton';
import { t, type TKey } from '../../i18n';

type Dimension = keyof FeedbackRatings;

const DIMENSIONS: Dimension[] = ['safety', 'fairness', 'respect', 'workload'];
const FACES = ['😞', '😕', '😐', '🙂', '😄'];
const SCALE = [1, 2, 3, 4, 5] as const;

export default function Feedback(_props: { me: Me }) {
  const [ratings, setRatings] = useState<Partial<FeedbackRatings>>({});
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<'thanks' | 'already' | null>(null);

  function choose(dimension: Dimension, value: number) {
    setRatings((prev) => ({ ...prev, [dimension]: value }));
  }

  async function submit(event: Event) {
    event.preventDefault();
    const complete = DIMENSIONS.every((d) => ratings[d] !== undefined);
    if (!complete) {
      setError(t('feedback.needAll'));
      return;
    }
    setBusy(true);
    setError(null);
    const body: FeedbackRequest = {
      ratings: {
        safety: ratings.safety ?? 0,
        fairness: ratings.fairness ?? 0,
        respect: ratings.respect ?? 0,
        workload: ratings.workload ?? 0,
      },
      comment: comment.trim() || undefined,
    };
    try {
      await api.post<{ ok: boolean }>('/api/feedback', body);
      setDone('thanks');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setDone('already');
      else setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    const message = done === 'thanks' ? t('feedback.thanks') : t('feedback.alreadyThisMonth');
    return (
      <section class="stack">
        <h1>{t('feedback.title')}</h1>
        <Banner tone="success">{message}</Banner>
        <div class="row">
          <SpeakButton text={message} />
        </div>
      </section>
    );
  }

  return (
    <form class="stack" onSubmit={(event) => void submit(event)}>
      <h1>{t('feedback.title')}</h1>
      <Banner tone="info">
        <p>{t('feedback.anonymous')}</p>
      </Banner>

      {DIMENSIONS.map((dimension) => {
        const question = t(`feedback.q.${dimension}` as TKey);
        return (
          <fieldset class="card stack question-card" key={dimension}>
            <legend class="field-label">{question}</legend>
            <div class="question-speak">
              <SpeakButton text={question} />
            </div>
            <div class="faces" role="radiogroup" aria-label={question}>
              {SCALE.map((value) => {
                const selected = ratings[dimension] === value;
                return (
                  <label key={value} class={`face${selected ? ' is-selected' : ''}`}>
                    <input
                      class="visually-hidden"
                      type="radio"
                      name={`rating-${dimension}`}
                      value={value}
                      checked={selected}
                      onChange={() => choose(dimension, value)}
                    />
                    <span class="face-emoji" aria-hidden="true">
                      {FACES[value - 1]}
                    </span>
                    <span class="visually-hidden">{t(`feedback.scale.${value}` as TKey)}</span>
                  </label>
                );
              })}
            </div>
            <div class="rating-caption" aria-hidden="true">
              <span>{t('feedback.scale.1')}</span>
              <strong>{ratings[dimension] ? t(`feedback.scale.${ratings[dimension]}` as TKey) : ''}</strong>
              <span>{t('feedback.scale.5')}</span>
            </div>
          </fieldset>
        );
      })}

      <div class="field">
        <label class="field-label" for="feedback-comment">
          {t('feedback.comment')}
        </label>
        <textarea
          id="feedback-comment"
          rows={3}
          value={comment}
          onInput={(event) => setComment((event.currentTarget).value)}
        />
        <LanguageNudge text={comment} />
      </div>

      {error ? <Banner tone="danger">{error}</Banner> : null}

      <div class="row">
        <button type="submit" class="btn btn-primary btn-block" disabled={busy}>
          {t('feedback.submit')}
        </button>
      </div>
    </form>
  );
}
