import { describe, expect, it } from 'vitest';
import type { FatigueFlag, Shift } from '../../../src/shared/types';
import { INDUSTRIES } from '../../../src/shared/industries';
import { scoreQuitRisk, type QuitRiskInput } from '../../../src/server/domain/quitRisk';

const cfg = INDUSTRIES.construction;
// 14-day window: 2024-01-06 12:00 -> 2024-01-20 12:00 IST; last 7 days: from Jan 13 12:00
const now = new Date('2024-01-20T12:00:00+05:30');

/** Shift on a 2024-01 IST day starting 08:00 (or startHour) lasting hours. */
function onDay(day: number, hours: number, startHour = 8): Shift {
  const dd = String(day).padStart(2, '0');
  const start = Date.parse(`2024-01-${dd}T${String(startHour).padStart(2, '0')}:00:00+05:30`);
  return {
    id: `d${day}`,
    workerId: 'w1',
    siteId: 'site-skyline',
    checkIn: new Date(start).toISOString(),
    checkOut: new Date(start + hours * 3_600_000).toISOString(),
    method: 'qr',
  };
}

function days(from: number, to: number, hours = 8): Shift[] {
  const out: Shift[] = [];
  for (let d = from; d <= to; d++) out.push(onDay(d, hours));
  return out;
}

function flag(rule: FatigueFlag['rule']): FatigueFlag {
  return { rule, severity: 'medium', detail: {}, at: now.toISOString() };
}

function input(overrides: Partial<QuitRiskInput>): QuitRiskInput {
  return {
    shifts: days(7, 20),
    fatigue: [],
    scheduledDays: 14,
    tenureDays: 400,
    now,
    cfg,
    ...overrides,
  };
}

describe('scoreQuitRisk', () => {
  it('scores 0 / low for steady attendance with no overtime or fatigue', () => {
    // 14 days worked of 14 scheduled; overtime 0; last7 7 vs prev7 7 -> no decline
    expect(scoreQuitRisk(input({}))).toEqual({ score: 0, level: 'low', factors: [] });
  });

  it('adds 25 for overtime strictly above 20 h in 14 days', () => {
    // 14 shifts of 10 h = 14 * 2 h overtime = 28 > 20 -> +25; still low
    const risk = scoreQuitRisk(input({ shifts: days(7, 20, 10) }));
    expect(risk.factors).toEqual([{ factor: 'high_overtime', points: 25 }]);
    expect(risk.score).toBe(25);
    expect(risk.level).toBe('low');
  });

  it('does not flag overtime of exactly 20 h', () => {
    // 10 shifts of 10 h = 10 * 2 = 20 h overtime; not > 20
    const risk = scoreQuitRisk(input({ shifts: days(11, 20, 10), scheduledDays: 10 }));
    expect(risk.factors.map((f) => f.factor)).not.toContain('high_overtime');
    expect(risk.score).toBe(0);
  });

  it('adds 8 per absence (scheduled - worked) capped at 24', () => {
    // scheduled 14, worked 10 -> 4 absences -> 32 -> capped at 24
    const risk = scoreQuitRisk(input({ shifts: days(11, 20) }));
    expect(risk.factors).toEqual([{ factor: 'absences', points: 24 }]);
    expect(risk.score).toBe(24);
  });

  it('adds 8 per single absence (2 absences = 16)', () => {
    // scheduled 12, worked 10 -> 2 absences -> 16
    const risk = scoreQuitRisk(input({ shifts: days(11, 20), scheduledDays: 12 }));
    expect(risk.factors).toEqual([{ factor: 'absences', points: 16 }]);
  });

  it('adds 15 for a new joiner (tenure under 90 days)', () => {
    const risk = scoreQuitRisk(input({ tenureDays: 30 }));
    expect(risk.factors).toEqual([{ factor: 'new_joiner', points: 15 }]);
    expect(risk.score).toBe(15);
  });

  it('does not add new_joiner at exactly 90 days tenure', () => {
    expect(scoreQuitRisk(input({ tenureDays: 90 })).factors).toEqual([]);
  });

  it('adds 10 per fatigue flag, capped at 30', () => {
    expect(scoreQuitRisk(input({ fatigue: [flag('short_rest')] })).factors).toEqual([
      { factor: 'fatigue', points: 10 },
    ]);
    const three = scoreQuitRisk(
      input({ fatigue: [flag('long_shift'), flag('short_rest'), flag('no_rest_day'), flag('weekly_overload')] }),
    );
    expect(three.factors).toContainEqual({ factor: 'fatigue', points: 30 });
  });

  it('adds 10 when last 7 days worked is at least 2 fewer than the previous 7', () => {
    // prev7 (Jan 7-13): days 7..11 = 5 worked; last7 (Jan 14-20): days 18,19 = 2 worked; 5 - 2 = 3 >= 2
    // total worked 7 of 14 scheduled -> 7 absences -> 56 capped to 24
    // score = 24 + 10 = 34 -> medium
    const shifts = [...days(7, 11), onDay(18, 8), onDay(19, 8)];
    const risk = scoreQuitRisk(input({ shifts }));
    expect(risk.factors).toContainEqual({ factor: 'declining_attendance', points: 10 });
    expect(risk.score).toBe(34);
    expect(risk.level).toBe('medium');
  });

  it('does not flag a decline of only 1 day', () => {
    // prev7 days 7,8 = 2; last7 day 18 = 1; difference 1 < 2
    const shifts = [onDay(7, 8), onDay(8, 8), onDay(18, 8)];
    const risk = scoreQuitRisk(input({ shifts, scheduledDays: 3 }));
    expect(risk.factors.map((f) => f.factor)).not.toContain('declining_attendance');
  });

  it('ignores shifts older than 14 days', () => {
    // Jan 1-6 are before the Jan 6 12:00 window start; 6 x 12 h would add 24 h overtime
    const old = days(1, 6, 12);
    expect(scoreQuitRisk(input({ shifts: [...old, ...days(7, 20)] })).score).toBe(0);
  });

  it('maps score to level: 40 -> medium, and factors carry their points', () => {
    // high_overtime 25 + new_joiner 15 = 40
    const risk = scoreQuitRisk(input({ shifts: days(7, 20, 10), tenureDays: 30 }));
    expect(risk.score).toBe(40);
    expect(risk.level).toBe('medium');
    expect(risk.factors.reduce((s, f) => s + f.points, 0)).toBe(40);
  });

  it('caps the score at 100 (all five factors = 104)', () => {
    // overtime: 6 x 12 h shifts -> 6 * 4 = 24 h > 20 -> +25
    // fatigue: 3 flags -> +30 (cap 30)
    // absences: 14 scheduled - 6 worked = 8 -> 64 -> +24 (cap 24)
    // new joiner (tenure 10) -> +15
    // declining: prev7 6 days - last7 0 days = 6 >= 2 -> +10
    // raw 104 -> capped 100 -> high
    const risk = scoreQuitRisk({
      shifts: days(7, 12, 12),
      fatigue: [flag('long_shift'), flag('short_rest'), flag('no_rest_day')],
      scheduledDays: 14,
      tenureDays: 10,
      now,
      cfg,
    });
    expect(risk.factors.map((f) => f.points).reduce((s, p) => s + p, 0)).toBe(104);
    expect(risk.score).toBe(100);
    expect(risk.level).toBe('high');
  });
});
