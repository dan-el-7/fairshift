import type { HazardPatternsResponse } from '../../../shared/hazardPatterns';
import { ErrorMessage } from '../../components/ErrorMessage';
import { SeverityBadge } from '../../components/Badge';
import { SpeakButton } from '../../components/SpeakButton';
import { Spinner } from '../../components/Spinner';
import { formatDay, t, type TKey } from '../../i18n';
import { LIVE_REFRESH_MS, useApiData } from '../../useApiData';
import { categoryLabel } from './shared';
import '../../hazard-patterns.css';

function queueHref(category: string): string {
  return `#/a/reports?filter=all&category=${encodeURIComponent(category)}`;
}

export function HazardPatterns() {
  const result = useApiData<HazardPatternsResponse>('/api/admin/hazard-patterns', { refreshMs: LIVE_REFRESH_MS });
  const data = result.data;
  const speech = data?.patterns.map((item) => t('patterns.cardSpeech', {
    category: categoryLabel(item.category),
    reports: item.reportCount,
    unresolved: item.unresolvedCount,
    severity: t(`severity.${item.highestSeverity}` as TKey),
  })).join('. ');

  return (
    <section class="card stack hazard-patterns" aria-labelledby="hazard-patterns-title">
      <div class="heading-row">
        <div>
          <h2 id="hazard-patterns-title">{t('patterns.title')}</h2>
          <p class="muted">{t('patterns.description', { days: data?.windowDays ?? 30 })}</p>
        </div>
        {speech ? <SpeakButton text={speech} /> : null}
      </div>
      {result.loading && !data ? <Spinner /> : null}
      {result.error ? <ErrorMessage error={result.error} onRetry={result.reload} /> : null}
      {data?.patterns.length === 0 ? <p class="muted">{t('patterns.empty')}</p> : null}
      {data?.patterns.length ? (
        <div class="hazard-pattern-grid">
          {data.patterns.map((item) => (
            <article class="hazard-pattern-card" key={item.category}>
              <div class="hazard-pattern-heading">
                <div>
                  <h3>{categoryLabel(item.category)}</h3>
                  <span class={`hazard-pattern-kind hazard-pattern-kind-${item.pattern}`}>
                    {t(`patterns.kind.${item.pattern}` as TKey)}
                  </span>
                </div>
                <SeverityBadge severity={item.highestSeverity} />
              </div>
              <p class="hazard-pattern-count">
                <strong>{item.reportCount}</strong> {t('patterns.reports')}
              </p>
              <p class="muted">{t('patterns.unresolved', { count: item.unresolvedCount })}</p>
              <p class="muted">{t('patterns.dates', { first: formatDay(item.firstDay), last: formatDay(item.lastDay) })}</p>
              <a class="btn btn-secondary hazard-pattern-link" href={queueHref(item.category)}>
                {t('patterns.review')}
              </a>
            </article>
          ))}
        </div>
      ) : null}
      <p class="hazard-pattern-note">{t('patterns.note')}</p>
      <p class="muted">{t('patterns.action')}</p>
    </section>
  );
}

export default HazardPatterns;
