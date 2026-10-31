import { describe, expect, it } from 'vitest';
import { INDUSTRIES } from '../../../src/shared/industries';
import type { Shift, Worker } from '../../../src/shared/types';
import { computePayCalendar } from '../../../src/server/domain/payCalendar';
import { computePayslip } from '../../../src/server/domain/payroll';
import { payPeriod } from '../../../src/server/services/calendar';

it('groups split shifts, half days and overnight work by IST check-in date, excluding open shifts from pay', () => {
  const worker: Worker = { id: 'w', siteId: 's', name: 'Worker', role: 'worker', language: 'en', jobTitle: 'Mason', joinedOn: '2020-01-01' };
  const shifts: Shift[] = [
    { id: '1', workerId: 'w', siteId: 's', checkIn: '2026-10-01T03:00:00Z', checkOut: '2026-10-01T05:00:00Z', method: 'qr' },
    { id: '2', workerId: 'w', siteId: 's', checkIn: '2026-10-01T06:00:00Z', checkOut: '2026-10-01T08:00:00Z', method: 'qr' },
    { id: '3', workerId: 'w', siteId: 's', checkIn: '2026-10-02T16:30:00Z', checkOut: '2026-10-03T02:30:00Z', method: 'qr' },
    { id: '4', workerId: 'w', siteId: 's', checkIn: '2026-10-04T03:00:00Z', checkOut: '2026-10-04T05:00:00Z', method: 'qr' },
    { id: '5', workerId: 'w', siteId: 's', checkIn: '2026-10-05T03:00:00Z', checkOut: null, method: 'qr' },
  ];
  const cfg = INDUSTRIES.construction;
  const slip = computePayslip(worker, shifts, payPeriod('2026-10', '2026-10-05'), cfg);
  const result = computePayCalendar(worker, shifts, slip, cfg, '2026-10-05', []);
  expect(result.days[0]?.base).toBe(75000);
  expect(result.days[1]?.summary).toMatchObject({ hours: 10, overtimeHours: 2, nightHours: 8 });
  expect(result.days[1]?.overtime).toBe(37500);
  expect(result.days[2]?.gross).toBe(0);
  expect(result.days[3]?.base).toBe(37500);
  expect(result.days[4]).toMatchObject({ open: true, gross: 0, net: 0 });
  expect(result.monthlyAdjustment).toBe(0);
});

describe('deduction allocation', () => {
  it('does not put the whole month’s deductions onto one completed day of a monthly salary', () => {
    const worker: Worker = { id: 'w', siteId: 's', name: 'Worker', role: 'worker', language: 'en', jobTitle: 'Staff', joinedOn: '2020-01-01' };
    const cfg = INDUSTRIES.college;
    const shifts: Shift[] = [{ id: '1', workerId: 'w', siteId: 's', checkIn: '2026-10-01T03:00:00Z', checkOut: '2026-10-01T11:00:00Z', method: 'qr' }];
    const slip = computePayslip(worker, shifts, payPeriod('2026-10', '2026-10-01'), cfg);
    const calendar = computePayCalendar(worker, shifts, slip, cfg, '2026-10-01', []);
    expect(calendar.days[0]?.net).toBeGreaterThan(0);
    expect(calendar.days[0]?.pf).toBeLessThanOrEqual(Math.round((calendar.days[0]?.base ?? 0) * .12));
    expect(calendar.days.reduce((sum, d) => sum + d.net, calendar.monthlyAdjustment)).toBe(slip.net);
  });
  it('keeps zero-shift days at zero when the monthly salary has a balance', () => {
    const worker: Worker = { id: 'w', siteId: 's', name: 'Worker', role: 'worker', language: 'en', jobTitle: 'Staff', joinedOn: '2020-01-01' };
    const cfg = INDUSTRIES.college;
    const slip = computePayslip(worker, [], payPeriod('2026-10', '2026-10-01'), cfg);
    const calendar = computePayCalendar(worker, [], slip, cfg, '2026-10-01', []);
    expect(calendar.days.every((day) => day.net === 0)).toBe(true);
    expect(calendar.monthlyAdjustment).toBe(slip.net);
  });
});
