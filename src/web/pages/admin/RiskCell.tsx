import type { RiskLevel } from '../../../shared/types';
import { t, type TKey } from '../../i18n';

/**
 * Quit-risk cell shared by the dashboard and the workers table: a fixed-width level badge, so the
 * badges line up in a column, then the score as "8 /100" on one line. Screen readers get the full
 * "Score 8 / 100" sentence.
 */
export function RiskCell({ level, score }: { level: RiskLevel; score: number }) {
  return (
    <span class="risk-cell">
      <span class={`badge badge-${level} risk-badge`}>{t(`risk.level.${level}` as TKey)}</span>
      <span class="risk-score">
        <span class="visually-hidden">{t('admin.riskScore', { score })}</span>
        <strong aria-hidden="true">{score}</strong>
        <span class="risk-of" aria-hidden="true">
          /100
        </span>
      </span>
    </span>
  );
}
