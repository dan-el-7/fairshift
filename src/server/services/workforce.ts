import type { WorkerSummary } from '../../shared/api';
import { INDUSTRIES } from '../../shared/industries';
import type { FatigueFlag, IndustryConfig, Shift, Site } from '../../shared/types';
import { summarisePeriod, summariseShift } from '../domain/attendance';
import { detectFatigue } from '../domain/fatigue';
import { scoreQuitRisk } from '../domain/quitRisk';
import { dayDiff, istDay, istMidnightMs } from '../domain/time';
import type { Repo } from '../store/repo';
import { countMonSat, lastDays } from './calendar';
import { effectiveWork } from './corrections';

const AT_RISK_SCORE = 30;

/** Attendance and overtime for one IST day across the site. */
export interface AttendancePoint {
  day: string;
  present: number;
  overtimeHours: number;
}

/** Site-wide workforce figures for the admin overview and the worker list. */
export interface Workforce {
  summaries: WorkerSummary[];
  attendance14d: AttendancePoint[];
  presentToday: number;
  overtimeHours14d: number;
  fatigueAlerts: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Builds per-worker fatigue and quit-risk summaries plus the 14-day site series.
 * Quit risk uses attendance and fatigue only, never reports or feedback.
 */
export async function buildWorkforce(repo: Repo, site: Site, now: Date): Promise<Workforce> {
  const cfg: IndustryConfig = INDUSTRIES[site.industry];
  const today = istDay(now);
  const days = lastDays(today, 14);
  const since = new Date(istMidnightMs(days[0] ?? today)).toISOString();
  const scheduledDays = countMonSat(days);

  const work = await effectiveWork(repo, site.id);
  const shifts = work.shifts.filter((s) => Date.parse(s.checkIn) >= Date.parse(since));
  const byWorker = new Map<string, Shift[]>();
  for (const shift of shifts) {
    const list = byWorker.get(shift.workerId) ?? [];
    list.push(shift);
    byWorker.set(shift.workerId, list);
  }

  const people = (await repo.listWorkers(site.id)).filter((w) => w.role === 'worker');
  const summaries: WorkerSummary[] = people.map((worker) => {
    const own = byWorker.get(worker.id) ?? [];
    const fatigue: FatigueFlag[] = detectFatigue(own, now);
    const period = summarisePeriod(own, cfg);
    const quitRisk = scoreQuitRisk({
      shifts: own,
      fatigue,
      scheduledDays,
      tenureDays: dayDiff(worker.joinedOn, today),
      now,
      cfg,
    });
    return {
      id: worker.id,
      name: worker.name,
      jobTitle: worker.jobTitle,
      language: worker.language,
      hours14d: period.hours,
      overtime14d: period.overtimeHours,
      fatigue,
      quitRisk,
    };
  });

  const attendance14d: AttendancePoint[] = days.map((day) => {
    const dayShifts = shifts.filter((s) => istDay(s.checkIn) === day);
    return {
      day,
      present: new Set(dayShifts.map((s) => s.workerId)).size,
      overtimeHours: round2(dayShifts.reduce((sum, s) => sum + summariseShift(s, cfg).overtimeHours, 0)),
    };
  });

  return {
    summaries: summaries.sort((a, b) => a.name.localeCompare(b.name)),
    attendance14d,
    presentToday: attendance14d[attendance14d.length - 1]?.present ?? 0,
    overtimeHours14d: round2(attendance14d.reduce((sum, p) => sum + p.overtimeHours, 0)),
    fatigueAlerts: summaries.reduce((sum, s) => sum + s.fatigue.length, 0),
  };
}

/** Workers at medium or high quit risk, highest score first. */
export function atRiskWorkers(summaries: WorkerSummary[]): WorkerSummary[] {
  return summaries
    .filter((s) => s.quitRisk.score >= AT_RISK_SCORE)
    .sort((a, b) => b.quitRisk.score - a.quitRisk.score || a.name.localeCompare(b.name));
}

/** Count of workers at high quit risk. */
export function highRiskCount(summaries: WorkerSummary[]): number {
  return summaries.filter((s) => s.quitRisk.level === 'high').length;
}
