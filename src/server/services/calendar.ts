import type { PayPeriod } from '../../shared/types';
import { addDays, istMidnightMs } from '../domain/time';

/** Day of week for a YYYY-MM-DD calendar day (0 = Sunday). Calendar arithmetic, no zone. */
export function weekdayOf(day: string): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

/** Inclusive list of YYYY-MM-DD days from `from` to `to`, oldest first. Empty when to < from. */
export function dayRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) out.push(day);
  return out;
}

/** The last `n` IST days ending with `today` (inclusive), oldest first. */
export function lastDays(today: string, n: number): string[] {
  return dayRange(addDays(today, -(n - 1)), today);
}

/** Number of Monday-to-Saturday days in the list (Sundays are not scheduled). */
export function countMonSat(days: string[]): number {
  return days.filter((d) => weekdayOf(d) !== 0).length;
}

/** Pay period for a YYYY-MM month. Working days count Mon-Sat, and only up to today for the current month. */
export function payPeriod(month: string, today: string): PayPeriod {
  const first = `${month}-01`;
  const [yearText, monthText] = month.split('-');
  const next = new Date(Date.UTC(Number(yearText), Number(monthText), 1)).toISOString().slice(0, 10);
  const lastDay = addDays(next, -1);
  const countTo = month === today.slice(0, 7) ? today : lastDay;

  return {
    id: month,
    start: new Date(istMidnightMs(first)).toISOString(),
    end: new Date(istMidnightMs(next)).toISOString(),
    workingDays: countMonSat(dayRange(first, countTo)),
  };
}
