import { INDUSTRIES } from '../../../shared/industries';
import type { ReportAdmin } from '../../../shared/api';
import type { ReportStatus, Severity } from '../../../shared/types';
import { t, type TKey } from '../../i18n';

export const REPORT_STATUSES: ReportStatus[] = ['open', 'acknowledged', 'in_progress', 'resolved'];
export const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low'];

const SEVERITY_RANK: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1 };

const KNOWN_CATEGORIES = new Set(Object.values(INDUSTRIES).flatMap((cfg) => cfg.hazardCategories));

/** Overdue first, then by priority (critical first), then oldest first. */
export function sortReports(list: ReportAdmin[]): ReportAdmin[] {
  return [...list].sort(
    (a, b) =>
      Number(b.overdue) - Number(a.overdue) ||
      SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
      a.createdDay.localeCompare(b.createdDay),
  );
}

/** Readable hazard label; unknown categories are shown as stored. */
export function categoryLabel(category: string): string {
  return KNOWN_CATEGORIES.has(category) ? t(`hazard.${category}` as TKey) : category;
}

/** Whole-number-free score text for an average on the 1 to 5 scale, one decimal place. */
export function oneDecimal(value: number): string {
  return value.toFixed(1);
}
