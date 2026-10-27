import { describe, expect, it } from 'vitest';
import type { IndustryConfig, PayPeriod, Shift, Worker } from '../../../src/shared/types';
import { INDUSTRIES } from '../../../src/shared/industries';
import { computePayslip } from '../../../src/server/domain/payroll';

const construction = INDUSTRIES.construction;
const college = INDUSTRIES.college;

const worker: Worker = {
  id: 'w-ravi',
  name: 'Ravi',
  siteId: 'site-skyline',
  role: 'worker',
  language: 'ta',
  jobTitle: 'Mason',
  joinedOn: '2023-06-01',
};

const jan2024: PayPeriod = {
  id: '2024-01',
  start: '2024-01-01T00:00:00+05:30',
  end: '2024-02-01T00:00:00+05:30',
  workingDays: 26,
};

/** One completed shift on a 2024-01 IST day, from startHour for hours. */
function shiftOn(day: number, startHour: number, hours: number, id = `s-${day}`): Shift {
  const dd = String(day).padStart(2, '0');
  const start = Date.parse(`2024-01-${dd}T${String(startHour).padStart(2, '0')}:00:00+05:30`);
  return {
    id,
    workerId: worker.id,
    siteId: 'site-skyline',
    checkIn: new Date(start).toISOString(),
    checkOut: new Date(start + hours * 3_600_000).toISOString(),
    method: 'qr',
  };
}

function days(from: number, to: number, startHour = 8, hours = 8): Shift[] {
  const out: Shift[] = [];
  for (let d = from; d <= to; d++) out.push(shiftOn(d, startHour, hours));
  return out;
}

function line(slip: ReturnType<typeof computePayslip>, key: string) {
  const found = slip.lines.find((l) => l.key === key);
  if (!found) throw new Error(`missing line ${key}`);
  return found;
}

describe('computePayslip: daily (construction)', () => {
  it('emits all six lines in order: base, overtime, night, pf, esi, advance', () => {
    const slip = computePayslip(worker, days(2, 4), jan2024, construction);
    expect(slip.lines.map((l) => l.key)).toEqual([
      'pay.base',
      'pay.overtime',
      'pay.night',
      'pay.pf',
      'pay.esi',
      'pay.advance',
    ]);
    expect(slip.lines.map((l) => l.kind)).toEqual([
      'earning',
      'earning',
      'earning',
      'deduction',
      'deduction',
      'deduction',
    ]);
  });

  it('hand-computed 3 x 9 h day shifts', () => {
    // daysWorked 3; base = 75000 * 3 = 225000
    // overtime hours 3 (1 per shift); rate 75000/8 = 9375; x2 => 3 * 9375 * 2 = 56250
    // night 0; gross = 225000 + 56250 = 281250
    // pf = 12% of 225000 = 27000 (cap 180000)
    // esi = 0.75% of 281250 = 2109.375 -> 2109 (gross <= 210000 paise)
    // net = 281250 - 27000 - 2109 - 0 = 252141
    const shifts = [
      shiftOn(2, 8, 9, 'a'),
      shiftOn(3, 8, 9, 'b'),
      shiftOn(4, 8, 9, 'c'),
    ];
    const slip = computePayslip(worker, shifts, jan2024, construction);

    expect(line(slip, 'pay.base')).toEqual({
      key: 'pay.base',
      amount: 225000,
      kind: 'earning',
      params: { days: 3, rate: 75000 },
    });
    expect(line(slip, 'pay.overtime')).toEqual({
      key: 'pay.overtime',
      amount: 56250,
      kind: 'earning',
      params: { hours: 3, rate: 9375, multiplier: 2 },
    });
    expect(line(slip, 'pay.night').amount).toBe(0);
    expect(line(slip, 'pay.pf')).toEqual({
      key: 'pay.pf',
      amount: 27000,
      kind: 'deduction',
      params: { percent: 12, base: 225000, cap: 180000 },
    });
    expect(line(slip, 'pay.esi')).toEqual({
      key: 'pay.esi',
      amount: 2109,
      kind: 'deduction',
      params: { percent: 0.75, gross: 281250 },
    });
    expect(slip.gross).toBe(281250);
    expect(slip.deductions).toBe(29109);
    expect(slip.net).toBe(252141);
    expect(slip.summary.daysWorked).toBe(3);
    expect(slip.industry).toBe('construction');
    expect(slip.workerId).toBe('w-ravi');
  });

  it('night allowance: 22:00-06:00 shift = 8 night hours x 2500 paise', () => {
    // base 75000 (1 day); overtime 0; night 8 * 2500 = 20000
    // gross = 95000; pf = 9000; esi = 95000 * 0.75% = 712.5 -> 713 (Math.round)
    // net = 95000 - 9000 - 713 = 85287
    const slip = computePayslip(worker, [shiftOn(5, 22, 8)], jan2024, construction);
    expect(line(slip, 'pay.night')).toEqual({
      key: 'pay.night',
      amount: 20000,
      kind: 'earning',
      params: { hours: 8, rate: 2500 },
    });
    expect(slip.gross).toBe(95000);
    expect(line(slip, 'pay.esi').amount).toBe(713);
    expect(slip.net).toBe(85287);
  });

  it('PF is capped at 180000 paise when 12% of base exceeds it', () => {
    // 28 full days: base 75000 * 28 = 2100000; 12% = 252000 -> capped at 180000
    // gross = 2100000 (no overtime) -> esi 2100000 * 0.75% = 15750 (cutoff is inclusive)
    const slip = computePayslip(worker, days(1, 28), jan2024, construction);
    expect(line(slip, 'pay.base').amount).toBe(2100000);
    expect(line(slip, 'pay.pf').amount).toBe(180000);
    expect(line(slip, 'pay.esi').amount).toBe(15750);
  });

  it('ESI is 0 when gross is above 21000 rupees (2100000 paise)', () => {
    // 29 days: base 75000 * 29 = 2175000 > 2100000 -> esi 0; params still carry gross
    const slip = computePayslip(worker, days(1, 29), jan2024, construction);
    expect(slip.gross).toBe(2175000);
    expect(line(slip, 'pay.esi')).toEqual({
      key: 'pay.esi',
      amount: 0,
      kind: 'deduction',
      params: { percent: 0.75, gross: 2175000 },
    });
  });

  it('deducts the period advance from net', () => {
    // base 75000 (1 day), esi 562.5 -> 563 (Math.round), pf 9000, advance 50000
    // gross 75000; net = 75000 - 9000 - 563 - 50000 = 15437
    const advanced: Worker = { ...worker, advanceThisPeriod: 50000 };
    const slip = computePayslip(advanced, [shiftOn(5, 8, 8)], jan2024, construction);
    expect(line(slip, 'pay.advance')).toEqual({
      key: 'pay.advance',
      amount: 50000,
      kind: 'deduction',
      params: {},
    });
    expect(slip.net).toBe(15437);
  });

  it('ignores shifts outside the period and counts open shifts as zero', () => {
    const outside = shiftOn(31, 8, 8);
    outside.checkIn = '2023-12-31T08:00:00+05:30';
    outside.checkOut = '2023-12-31T16:00:00+05:30';
    const open: Shift = { ...shiftOn(6, 8, 8), checkOut: null };
    const slip = computePayslip(worker, [outside, open], jan2024, construction);
    expect(slip.summary.daysWorked).toBe(0);
    expect(line(slip, 'pay.base').amount).toBe(0);
  });

  it('a half day (3 h) pays 0.5 of the daily wage', () => {
    // daysWorked 0.5; base = 75000 * 0.5 = 37500; gross 37500; pf 4500; esi 37500*0.75% = 281.25 -> 281
    // net = 37500 - 4500 - 281 = 32719
    const slip = computePayslip(worker, [shiftOn(9, 9, 3)], jan2024, construction);
    expect(line(slip, 'pay.base').amount).toBe(37500);
    expect(slip.net).toBe(32719);
  });
});

describe('computePayslip: monthly (college)', () => {
  const college26: Shift[] = days(1, 26, 8, 8);

  it('full attendance pays the full salary; PF capped at 180000 paise', () => {
    // base = 1800000 - 0 absent days = 1800000; pf 12% = 216000 -> capped 180000
    // gross 1800000; esi 1800000 * 0.75% = 13500; net = 1800000 - 180000 - 13500 = 1606500
    const slip = computePayslip(worker, college26, jan2024, college);
    expect(line(slip, 'pay.base')).toEqual({
      key: 'pay.base',
      amount: 1800000,
      kind: 'earning',
      params: { salary: 1800000, absentDays: 0, dayRate: 1800000 / 26 },
    });
    expect(line(slip, 'pay.pf').amount).toBe(180000);
    expect(line(slip, 'pay.esi').amount).toBe(13500);
    expect(slip.net).toBe(1606500);
  });

  it('deducts absent days pro-rata: 20 days worked of 26 -> 6 absent', () => {
    // dayRate = 1800000 / 26 = 69230.769...; absent 6 -> 415384.615...
    // base = round(1800000 - 415384.615) = round(1384615.385) = 1384615
    // pf = round(1384615 * 0.12) = round(166153.8) = 166154
    // esi = round(1384615 * 0.0075) = round(10384.6125) = 10385
    // net = 1384615 - 166154 - 10385 = 1208076
    const slip = computePayslip(worker, days(1, 20, 8, 8), jan2024, college);
    const base = line(slip, 'pay.base');
    expect(base.amount).toBe(1384615);
    expect(base.params.absentDays).toBe(6);
    expect(base.params.dayRate).toBeCloseTo(69230.769, 2);
    expect(line(slip, 'pay.pf').amount).toBe(166154);
    expect(line(slip, 'pay.esi').amount).toBe(10385);
    expect(slip.net).toBe(1208076);
  });

  it('overtime at hourly rate x2: 10 h day -> 2 h overtime, rate rounded to 8654 paise', () => {
    // hourly = 1800000 / 26 / 8 = 8653.846... -> rate 8654
    // overtime = 2 * 8654 * 2 = 34616
    // base: 25 absent days -> 1800000 - 25 * 69230.769 = 69230.77 -> 69231
    // gross = 69231 + 34616 = 103847; pf = round(8307.72) = 8308; esi = round(778.8525) = 779
    // net = 103847 - 8308 - 779 = 94760
    const slip = computePayslip(worker, [shiftOn(7, 8, 10)], jan2024, college);
    expect(line(slip, 'pay.overtime')).toEqual({
      key: 'pay.overtime',
      amount: 34616,
      kind: 'earning',
      params: { hours: 2, rate: 8654, multiplier: 2 },
    });
    expect(line(slip, 'pay.base').amount).toBe(69231);
    expect(slip.gross).toBe(103847);
    expect(slip.net).toBe(94760);
  });
});

describe('computePayslip: configuration', () => {
  it('uses the industry config it is given (custom industry = one config object)', () => {
    const hospital: IndustryConfig = {
      ...construction,
      id: 'construction',
      dailyWage: 100000,
      overtimeMultiplier: 1.5,
    };
    // 1 day of 8 h: base 100000; no overtime; pf 12000; esi 750 -> net 100000 - 12000 - 750 = 87250
    const slip = computePayslip(worker, [shiftOn(3, 8, 8)], jan2024, hospital);
    expect(slip.net).toBe(87250);
  });
});
