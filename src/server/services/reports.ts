import type { Report, Severity } from '../../shared/types';
import { caseCode } from '../domain/anonymity';
import { dayDiff } from '../domain/time';
import type { Repo } from '../store/repo';

/**
 * Days after createdDay at which an unresolved report is overdue (SPEC "Report SLA").
 * Reports only store the day, so 24 h maps to 1 day and 72 h to 3 days.
 */
export const SLA_DAYS: Record<Severity, number> = {
  critical: 1,
  high: 3,
  medium: 7,
  low: 14,
};

/** True when the report is unresolved and at or past its SLA on the given IST day. */
export function isOverdue(report: Report, today: string): boolean {
  return report.status !== 'resolved' && dayDiff(report.createdDay, today) >= SLA_DAYS[report.severity];
}

/** A case code not yet used by any stored report. */
export async function freshCaseCode(repo: Repo): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = caseCode();
    if ((await repo.getReportByCode(code)) === null) return code;
  }
  throw new Error('could not allocate a unique case code');
}
