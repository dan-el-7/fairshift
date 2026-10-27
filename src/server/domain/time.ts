const IST_OFFSET_MIN = 330;
const MS_HOUR = 3_600_000;
const MS_DAY = 86_400_000;

/** Converts a Date, ISO string or epoch milliseconds to epoch milliseconds. */
export function toMs(input: Date | string | number): number {
  if (typeof input === 'number') return input;
  return typeof input === 'string' ? Date.parse(input) : input.getTime();
}

/** Returns the IST calendar day (YYYY-MM-DD) of a Date, ISO string or epoch ms. Fixed +05:30, no DST. */
export function istDay(input: Date | string | number): string {
  const shifted = new Date(toMs(input) + IST_OFFSET_MIN * 60_000);
  return shifted.toISOString().slice(0, 10);
}

/** Epoch milliseconds of IST midnight starting the given YYYY-MM-DD day. */
export function istMidnightMs(day: string): number {
  return Date.parse(`${day}T00:00:00+05:30`);
}

/** Adds whole days to a YYYY-MM-DD string (calendar arithmetic, no timezone involved). */
export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * MS_DAY).toISOString().slice(0, 10);
}

/** Signed number of whole days from `from` to `to` (both YYYY-MM-DD). */
export function dayDiff(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_DAY);
}

/** Unrounded hours between two instants (end minus start). */
export function hoursBetween(start: Date | string | number, end: Date | string | number): number {
  return (toMs(end) - toMs(start)) / MS_HOUR;
}

/** Hours of overlap between [startMs, endMs) and the IST night window 22:00-06:00. */
export function nightOverlapHours(startMs: number, endMs: number): number {
  if (endMs <= startMs) return 0;
  let total = 0;
  const firstDay = addDays(istDay(startMs), -1);
  const lastDay = istDay(endMs);
  for (let day = firstDay; day <= lastDay; day = addDays(day, 1)) {
    const midnight = istMidnightMs(day);
    const windowStart = midnight + 22 * MS_HOUR;
    const windowEnd = midnight + 30 * MS_HOUR;
    const overlap = Math.min(endMs, windowEnd) - Math.max(startMs, windowStart);
    if (overlap > 0) total += overlap;
  }
  return total / MS_HOUR;
}
