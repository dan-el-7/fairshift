import { describe, expect, it } from 'vitest';
import type { Shift } from '../../../src/shared/types';
import { detectFatigue } from '../../../src/server/domain/fatigue';

// now = 2024-01-20 12:00 IST; look-back starts 2024-01-06 12:00 IST
const now = new Date('2024-01-20T12:00:00+05:30');

function shift(checkIn: string, checkOut: string | null, id = checkIn): Shift {
  return { id, workerId: 'w1', siteId: 'site-skyline', checkIn, checkOut, method: 'qr' };
}

/** Shift on a 2024-01 IST day starting at startHour and lasting hours. */
function onDay(day: number, startHour: number, hours: number): Shift {
  const dd = String(day).padStart(2, '0');
  const start = Date.parse(`2024-01-${dd}T${String(startHour).padStart(2, '0')}:00:00+05:30`);
  return shift(new Date(start).toISOString(), new Date(start + hours * 3_600_000).toISOString(), `d${day}-${startHour}`);
}

function rules(flags: ReturnType<typeof detectFatigue>): string[] {
  return flags.map((f) => f.rule).sort();
}

describe('detectFatigue', () => {
  it('returns no flags for normal 8 h shifts with rest days', () => {
    const shifts = [onDay(8, 8, 8), onDay(9, 8, 8), onDay(11, 8, 8)];
    expect(detectFatigue(shifts, now)).toEqual([]);
  });

  it('flags a shift longer than 12 h as high severity', () => {
    // 06:00 -> 19:00 = 13 h > 12
    const flags = detectFatigue([onDay(15, 6, 13)], now);
    expect(flags).toEqual([
      {
        rule: 'long_shift',
        severity: 'high',
        detail: { hours: 13, day: '2024-01-15' },
        at: new Date(Date.parse('2024-01-15T06:00:00+05:30')).toISOString(),
      },
    ]);
  });

  it('does not flag a shift of exactly 12 h', () => {
    expect(detectFatigue([onDay(15, 6, 12)], now).map((f) => f.rule)).not.toContain('long_shift');
  });

  it('flags less than 10 h between shifts as medium (gap 9 h)', () => {
    // Jan 16 08:00 -> 17:00 ends; Jan 17 02:00 starts: gap = 9 h
    const flags = detectFatigue([onDay(16, 8, 9), onDay(17, 2, 8)], now);
    const rest = flags.find((f) => f.rule === 'short_rest');
    expect(rest?.severity).toBe('medium');
    expect(rest?.detail.restHours).toBe(9);
  });

  it('does not flag a gap of exactly 10 h', () => {
    // Jan 16 08:00 -> 18:00 ends; Jan 17 04:00 starts: gap = 10 h
    expect(detectFatigue([onDay(16, 8, 10), onDay(17, 4, 8)], now).map((f) => f.rule)).not.toContain(
      'short_rest',
    );
  });

  it('flags 7 or more consecutive IST days with a shift as high (8 days)', () => {
    const shifts = [8, 9, 10, 11, 12, 13, 14, 15].map((d) => onDay(d, 8, 8));
    const flag = detectFatigue(shifts, now).find((f) => f.rule === 'no_rest_day');
    expect(flag?.severity).toBe('high');
    expect(flag?.detail).toEqual({ consecutiveDays: 8, endDay: '2024-01-15' });
  });

  it('does not flag 6 consecutive days', () => {
    const shifts = [8, 9, 10, 11, 12, 13].map((d) => onDay(d, 8, 8));
    expect(detectFatigue(shifts, now).map((f) => f.rule)).not.toContain('no_rest_day');
  });

  it('flags more than 60 h in a rolling 7-day window as medium', () => {
    // 7 consecutive 9 h shifts = 63 h in the window ending Jan 14
    const shifts = [8, 9, 10, 11, 12, 13, 14].map((d) => onDay(d, 8, 9));
    const flag = detectFatigue(shifts, now).find((f) => f.rule === 'weekly_overload');
    expect(flag?.severity).toBe('medium');
    expect(flag?.detail).toEqual({ hours: 63, endDay: '2024-01-14' });
  });

  it('does not flag exactly 60 h in a window', () => {
    // 6 days x 9 h = 54; plus 1 day x 6 h = 60 -> not > 60
    const shifts = [onDay(8, 8, 9), onDay(9, 8, 9), onDay(10, 8, 9), onDay(11, 8, 9), onDay(12, 8, 9), onDay(13, 8, 9), onDay(14, 8, 6)];
    expect(detectFatigue(shifts, now).map((f) => f.rule)).not.toContain('weekly_overload');
  });

  it('keeps only the most recent flag per rule', () => {
    // two long shifts: Jan 10 (14 h) and Jan 17 (13 h); only the Jan 17 one is kept
    const flags = detectFatigue([onDay(10, 6, 14), onDay(17, 6, 13)], now);
    const longShifts = flags.filter((f) => f.rule === 'long_shift');
    expect(longShifts).toHaveLength(1);
    expect(longShifts[0]?.detail).toEqual({ hours: 13, day: '2024-01-17' });
  });

  it('ignores shifts older than 14 days', () => {
    // Jan 5 is before the Jan 6 12:00 look-back start
    expect(detectFatigue([onDay(5, 6, 14)], now)).toEqual([]);
  });

  it('ignores open shifts', () => {
    const open = shift('2024-01-15T06:00:00+05:30', null);
    expect(detectFatigue([open], now)).toEqual([]);
  });

  it('can report several different rules at once', () => {
    const shifts = [8, 9, 10, 11, 12, 13, 14, 15].map((d) => onDay(d, 8, 9));
    expect(rules(detectFatigue(shifts, now))).toEqual(['no_rest_day', 'weekly_overload']);
  });
});
