import type {
  FatigueFlag,
  IndustryConfig,
  QuitRisk,
  QuitRiskFactor,
  RiskLevel,
  Shift,
} from '../../shared/types';
import { summarisePeriod } from './attendance';
import { toMs } from './time';

export interface QuitRiskInput {
  /** Shifts; only those within the last 14 days are scored. */
  shifts: Shift[];
  fatigue: FatigueFlag[];
  /** Scheduled working days in the last 14 days. */
  scheduledDays: number;
  tenureDays: number;
  now: Date;
  cfg: IndustryConfig;
}

const DAY_MS = 86_400_000;

/**
 * Scores attrition risk from attendance and fatigue only. Never uses anonymous
 * reports or feedback. Score is capped at 100.
 */
export function scoreQuitRisk(input: QuitRiskInput): QuitRisk {
  const { shifts, fatigue, scheduledDays, tenureDays, now, cfg } = input;
  const nowMs = now.getTime();
  const within = (from: number, to: number): Shift[] =>
    shifts.filter((s) => {
      const t = toMs(s.checkIn);
      return t >= from && t < to;
    });

  const last14 = within(nowMs - 14 * DAY_MS, nowMs + 1);
  const last14Summary = summarisePeriod(last14, cfg);

  const factors: QuitRiskFactor[] = [];
  const add = (factor: QuitRiskFactor['factor'], points: number): void => {
    if (points > 0) factors.push({ factor, points });
  };

  if (last14Summary.overtimeHours > 20) add('high_overtime', 25);

  add('fatigue', Math.min(30, fatigue.length * 10));

  const absences = Math.max(0, scheduledDays - last14Summary.daysWorked);
  add('absences', Math.min(24, absences * 8));

  if (tenureDays < 90) add('new_joiner', 15);

  const last7 = summarisePeriod(within(nowMs - 7 * DAY_MS, nowMs + 1), cfg).daysWorked;
  const prev7 = summarisePeriod(within(nowMs - 14 * DAY_MS, nowMs - 7 * DAY_MS), cfg).daysWorked;
  if (prev7 - last7 >= 2) add('declining_attendance', 10);

  const score = Math.min(100, factors.reduce((sum, f) => sum + f.points, 0));
  return { score, level: levelFor(score), factors };
}

function levelFor(score: number): RiskLevel {
  if (score < 30) return 'low';
  if (score < 60) return 'medium';
  return 'high';
}
