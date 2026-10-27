import type { FatigueFlag, Shift } from '../../shared/types';
import { addDays, dayDiff, hoursBetween, istDay, toMs } from './time';

const LOOKBACK_MS = 14 * 86_400_000;
const LONG_SHIFT_HOURS = 12;
const SHORT_REST_HOURS = 10;
const NO_REST_RUN_DAYS = 7;
const WEEKLY_OVERLOAD_HOURS = 60;

interface Completed {
  checkInMs: number;
  checkOutMs: number;
  hours: number;
  day: string;
  checkIn: string;
  checkOut: string;
}

/**
 * Detects fatigue risks in the last 14 days of completed shifts.
 * Returns at most one flag per rule (the most recent occurrence), newest first.
 */
export function detectFatigue(shifts: Shift[], now: Date): FatigueFlag[] {
  const completed = completedWithin(shifts, now.getTime());
  const days = [...new Set(completed.map((s) => s.day))].sort();

  return keepMostRecentPerRule([
    ...longShiftFlags(completed),
    ...shortRestFlags(completed),
    ...noRestDayFlags(completed, days),
    ...weeklyOverloadFlags(completed, days),
  ]);
}

/** Completed shifts that started inside the lookback window, oldest first. */
function completedWithin(shifts: Shift[], nowMs: number): Completed[] {
  return shifts
    .filter((s): s is Shift & { checkOut: string } => s.checkOut !== null)
    .map((s) => {
      const checkInMs = toMs(s.checkIn);
      const checkOutMs = toMs(s.checkOut);
      return {
        checkInMs,
        checkOutMs,
        hours: hoursBetween(checkInMs, checkOutMs),
        day: istDay(checkInMs),
        checkIn: s.checkIn,
        checkOut: s.checkOut,
      };
    })
    .filter((s) => s.checkInMs >= nowMs - LOOKBACK_MS && s.checkInMs <= nowMs)
    .sort((a, b) => a.checkInMs - b.checkInMs);
}

function longShiftFlags(completed: Completed[]): FatigueFlag[] {
  const flags: FatigueFlag[] = [];
  for (const s of completed) {
    if (s.hours > LONG_SHIFT_HOURS) {
      flags.push({
        rule: 'long_shift',
        severity: 'high',
        detail: { hours: round1(s.hours), day: s.day },
        at: s.checkIn,
      });
    }
  }
  return flags;
}

function shortRestFlags(completed: Completed[]): FatigueFlag[] {
  const flags: FatigueFlag[] = [];
  for (let i = 1; i < completed.length; i++) {
    const prev = completed[i - 1];
    const cur = completed[i];
    if (!prev || !cur) continue;
    const gap = hoursBetween(prev.checkOutMs, cur.checkInMs);
    if (gap >= 0 && gap < SHORT_REST_HOURS) {
      flags.push({
        rule: 'short_rest',
        severity: 'medium',
        detail: { restHours: round1(gap), day: cur.day },
        at: cur.checkIn,
      });
    }
  }
  return flags;
}

/** A run of at least NO_REST_RUN_DAYS consecutive days with a shift, flagged on its last day. */
function noRestDayFlags(completed: Completed[], days: string[]): FatigueFlag[] {
  const flags: FatigueFlag[] = [];
  let runStart = 0;
  for (let i = 0; i < days.length; i++) {
    const prevDay = days[i - 1];
    const curDay = days[i];
    if (curDay === undefined) continue;
    if (prevDay !== undefined && dayDiff(prevDay, curDay) !== 1) runStart = i;
    const runLength = i - runStart + 1;
    if (runLength >= NO_REST_RUN_DAYS && (days[i + 1] === undefined || dayDiff(curDay, days[i + 1] ?? '') !== 1)) {
      const lastShift = [...completed].reverse().find((s) => s.day === curDay);
      flags.push({
        rule: 'no_rest_day',
        severity: 'high',
        detail: { consecutiveDays: runLength, endDay: curDay },
        at: lastShift?.checkIn ?? `${curDay}T00:00:00+05:30`,
      });
    }
  }
  return flags;
}

/** Total hours in each rolling seven-day window that ends on a worked day, when over the limit. */
function weeklyOverloadFlags(completed: Completed[], days: string[]): FatigueFlag[] {
  const flags: FatigueFlag[] = [];
  for (const endDay of days) {
    const windowStart = addDays(endDay, -6);
    const inWindow = completed.filter((s) => s.day >= windowStart && s.day <= endDay);
    const total = inWindow.reduce((sum, s) => sum + s.hours, 0);
    if (total > WEEKLY_OVERLOAD_HOURS) {
      const latest = inWindow[inWindow.length - 1];
      flags.push({
        rule: 'weekly_overload',
        severity: 'medium',
        detail: { hours: round1(total), endDay },
        at: latest?.checkIn ?? `${endDay}T00:00:00+05:30`,
      });
    }
  }
  return flags;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function keepMostRecentPerRule(flags: FatigueFlag[]): FatigueFlag[] {
  const latest = new Map<FatigueFlag['rule'], FatigueFlag>();
  for (const flag of flags) {
    const existing = latest.get(flag.rule);
    if (!existing || toMs(flag.at) > toMs(existing.at)) latest.set(flag.rule, flag);
  }
  return [...latest.values()].sort((a, b) => toMs(b.at) - toMs(a.at));
}
