import { describe, expect, it } from 'vitest';
import {
  addDays,
  dayDiff,
  hoursBetween,
  istDay,
  nightOverlapHours,
} from '../../../src/server/domain/time';

describe('istDay', () => {
  it('buckets by IST, not UTC: 18:29:59Z is still the same IST day', () => {
    // 18:29:59Z + 5:30 = 23:59:59 IST on 2024-01-10
    expect(istDay('2024-01-10T18:29:59Z')).toBe('2024-01-10');
  });

  it('rolls over exactly at IST midnight: 18:30:00Z = 00:00 IST next day', () => {
    // 18:30:00Z + 5:30 = 2024-01-11 00:00 IST
    expect(istDay('2024-01-10T18:30:00Z')).toBe('2024-01-11');
  });

  it('accepts Date objects and offset ISO strings', () => {
    expect(istDay(new Date('2024-01-10T18:30:00Z'))).toBe('2024-01-11');
    expect(istDay('2024-01-10T00:00:00+05:30')).toBe('2024-01-10');
  });

  it('uses a fixed +05:30 offset with no DST: a July date gives the same offset', () => {
    // 2024-07-01T19:00:00Z + 5:30 = 2024-07-02 00:30 IST
    expect(istDay('2024-07-01T19:00:00Z')).toBe('2024-07-02');
  });
});

describe('hoursBetween', () => {
  it('returns unrounded fractional hours', () => {
    // 17:30 - 08:00 = 9.5 h
    expect(hoursBetween('2024-01-10T08:00:00+05:30', '2024-01-10T17:30:00+05:30')).toBe(9.5);
  });

  it('is negative when end precedes start', () => {
    expect(hoursBetween('2024-01-10T10:00:00Z', '2024-01-10T09:00:00Z')).toBe(-1);
  });
});

describe('addDays / dayDiff', () => {
  it('handles month and year boundaries and leap days', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
    expect(addDays('2024-12-31', 1)).toBe('2025-01-01');
  });

  it('counts whole days between YYYY-MM-DD strings', () => {
    expect(dayDiff('2024-01-01', '2024-01-08')).toBe(7);
    expect(dayDiff('2024-01-08', '2024-01-01')).toBe(-7);
  });
});

describe('nightOverlapHours (IST 22:00-06:00)', () => {
  const ms = (iso: string): number => Date.parse(iso);

  it('counts a shift that crosses midnight: 23:00 to 07:00 = 7 night hours', () => {
    // night window 22:00-06:00; overlap 23:00 -> 06:00 = 7 h
    expect(
      nightOverlapHours(ms('2024-01-10T23:00:00+05:30'), ms('2024-01-11T07:00:00+05:30')),
    ).toBe(7);
  });

  it('counts an evening-only overlap: 21:00 to 23:00 = 1 night hour', () => {
    expect(
      nightOverlapHours(ms('2024-01-10T21:00:00+05:30'), ms('2024-01-10T23:00:00+05:30')),
    ).toBe(1);
  });

  it('counts an early-morning overlap: 03:00 to 05:00 = 2 night hours', () => {
    expect(
      nightOverlapHours(ms('2024-01-11T03:00:00+05:30'), ms('2024-01-11T05:00:00+05:30')),
    ).toBe(2);
  });

  it('is zero for a daytime shift: 10:00 to 18:00', () => {
    expect(
      nightOverlapHours(ms('2024-01-10T10:00:00+05:30'), ms('2024-01-10T18:00:00+05:30')),
    ).toBe(0);
  });

  it('is the full 8 h for 20:00 to 08:00 minus the 2 h before 22:00 and after 06:00', () => {
    // 20:00-08:00 spans 12 h; night part 22:00 -> 06:00 = 8 h
    expect(
      nightOverlapHours(ms('2024-01-10T20:00:00+05:30'), ms('2024-01-11T08:00:00+05:30')),
    ).toBe(8);
  });

  it('spans two nights: 23:00 Jan 10 to 01:00 Jan 12 = 7 + 3 = 10 night hours', () => {
    // Night 1: 23:00 -> 06:00 (Jan 11) = 7 h; night 2: 22:00 -> 01:00 (Jan 12) = 3 h
    expect(
      nightOverlapHours(ms('2024-01-10T23:00:00+05:30'), ms('2024-01-12T01:00:00+05:30')),
    ).toBe(10);
  });

  it('is zero when end equals or precedes start', () => {
    const t = ms('2024-01-10T23:00:00+05:30');
    expect(nightOverlapHours(t, t)).toBe(0);
    expect(nightOverlapHours(t, t - 3_600_000)).toBe(0);
  });
});
