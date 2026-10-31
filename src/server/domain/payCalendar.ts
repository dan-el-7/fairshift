import type { DayOff, IndustryConfig, PayCalendar, Payslip, Shift, Worker } from '../../shared/types';
import { dayRange } from '../services/calendar';
import { computePayslip } from './payroll';
import { addDays, istDay } from './time';

/** Allocate integer paise by earnings share. Salary-balance deductions stay in the monthly adjustment. */
function allocate(total: number, weights: number[], monthlyWeight: number): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  const denominator = Math.max(sum, monthlyWeight);
  let cumulative = 0;
  let assigned = 0;
  return weights.map((weight) => {
    cumulative += weight;
    const next = denominator > 0 ? Math.round(total * cumulative / denominator) : 0;
    const amount = next - assigned;
    assigned = next;
    return amount;
  });
}

/** Estimates follow the payslip's IST check-in date convention, including overnight shifts. */
export function computePayCalendar(worker: Worker, shifts: Shift[], slip: Payslip, cfg: IndustryConfig, today: string, daysOff: DayOff[]): PayCalendar {
  const first = `${slip.period.id}-01`;
  const last = addDays(istDay(slip.period.end), -1);
  const dailyConfig: IndustryConfig = {
    ...cfg,
    payModel: 'daily',
    dailyWage: cfg.payModel === 'daily' ? cfg.dailyWage ?? 0 : (cfg.monthlySalary ?? 0) / (cfg.workingDaysPerMonth ?? 1),
  };
  const days = dayRange(first, last).map((day) => {
    const recorded = day <= today ? shifts.filter((s) => istDay(s.checkIn) === day) : [];
    const estimate = computePayslip({ ...worker, advanceThisPeriod: 0 }, recorded, slip.period, dailyConfig);
    const amount = (key: string) => estimate.lines.find((line) => line.key === key)?.amount ?? 0;
    const off = daysOff.find((d) => d.active && d.day === day);
    return {
      day, summary: estimate.summary, open: recorded.some((s) => s.checkOut === null),
      ...(off ? { dayOff: off.label } : {}),
      base: amount('pay.base'), overtime: amount('pay.overtime'), night: amount('pay.night'),
      gross: estimate.gross, pf: 0, esi: 0, net: 0,
    };
  });
  const pf = allocate(slip.lines.find((l) => l.key === 'pay.pf')?.amount ?? 0, days.map((d) => d.base), slip.lines.find((l) => l.key === 'pay.base')?.amount ?? 0);
  const esi = allocate(slip.lines.find((l) => l.key === 'pay.esi')?.amount ?? 0, days.map((d) => d.gross), slip.gross);
  days.forEach((day, i) => {
    day.pf = pf[i] ?? 0;
    day.esi = esi[i] ?? 0;
    day.net = day.gross - day.pf - day.esi;
  });
  const adjustedDays = days.map((day) => {
    const adjustment = slip.adjustments?.filter((a) => a.day === day.day).reduce((sum, a) => sum + a.amount, 0) ?? 0;
    return adjustment === 0 ? day : { ...day, adjustment, net: day.net + adjustment };
  });
  return { month: slip.period.id, today, days: adjustedDays, monthlyAdjustment: slip.net - adjustedDays.reduce((sum, d) => sum + d.net, 0) };
}
