import type { HazardPattern, HazardPatternsResponse } from '../../shared/hazardPatterns';
import type { Report, Severity } from '../../shared/types';
import { istDay } from './time';

export const HAZARD_PATTERN_WINDOW_DAYS = 30;
const MIN_REPORTS = 3;
const MIN_DAYS = 2;
const PERSISTENT_DAYS = 7;
const SEVERITY_RANK: Record<Severity, number> = { low: 0, medium: 1, high: 2, critical: 3 };

function parseDay(day: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const time = Date.parse(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== day) return null;
  return time;
}

function inWindow(report: Report, cutoff: number, today: number): boolean {
  const day = parseDay(report.createdDay);
  return day !== null && day >= cutoff && day <= today && report.category.trim().length > 0;
}

/** Aggregate only the supplied site's anonymous reports; no report text or identifiers leave this function. */
export function summarizeHazardPatterns(
  reports: Report[],
  now: Date,
  windowDays = HAZARD_PATTERN_WINDOW_DAYS,
): HazardPatternsResponse {
  const today = istDay(now);
  const todayTime = parseDay(today);
  if (todayTime === null || !Number.isInteger(windowDays) || windowDays < 1) {
    return { windowDays, patterns: [] };
  }
  const cutoff = todayTime - (windowDays - 1) * 86_400_000;
  const groups = new Map<string, { days: Set<string>; reports: Report[] }>();
  for (const report of reports) {
    if (!inWindow(report, cutoff, todayTime)) continue;
    const group = groups.get(report.category) ?? { days: new Set<string>(), reports: [] };
    group.days.add(report.createdDay);
    group.reports.push(report);
    groups.set(report.category, group);
  }

  const patterns: HazardPattern[] = [];
  for (const [category, group] of groups) {
    if (group.reports.length < MIN_REPORTS || group.days.size < MIN_DAYS) continue;
    const orderedDays = [...group.days].sort();
    const firstDay = orderedDays[0], lastDay = orderedDays.at(-1);
    if (!firstDay || !lastDay) continue;
    const highestSeverity = group.reports.reduce<Severity>(
      (highest, report) => SEVERITY_RANK[report.severity] > SEVERITY_RANK[highest] ? report.severity : highest,
      'low',
    );
    patterns.push({
      category,
      reportCount: group.reports.length,
      unresolvedCount: group.reports.filter((report) => report.status !== 'resolved').length,
      firstDay,
      lastDay,
      highestSeverity,
      pattern: group.reports.some((report) => {
        const dayTime = parseDay(report.createdDay);
        return report.status !== 'resolved' && dayTime !== null
          && todayTime - dayTime >= PERSISTENT_DAYS * 86_400_000;
      }) ? 'persistent' : 'repeating',
    });
  }
  patterns.sort((a, b) => SEVERITY_RANK[b.highestSeverity] - SEVERITY_RANK[a.highestSeverity]
    || b.reportCount - a.reportCount || a.category.localeCompare(b.category));
  return { windowDays, patterns };
}
