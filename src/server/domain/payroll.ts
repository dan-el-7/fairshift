import type {
  IndustryConfig,
  PayLine,
  PayPeriod,
  Payslip,
  Shift,
  Worker,
} from '../../shared/types';
import { summarisePeriod } from './attendance';
import { toMs } from './time';

const PF_PERCENT = 12;
const PF_CAP_PAISE = 180_000;
const ESI_PERCENT = 0.75;
const ESI_CUTOFF_PAISE = 2_100_000;

/** Hourly rate in paise from the industry pay model. */
function hourlyRate(cfg: IndustryConfig): number {
  if (cfg.payModel === 'daily') {
    return (cfg.dailyWage ?? 0) / cfg.regularHoursPerDay;
  }
  return (cfg.monthlySalary ?? 0) / (cfg.workingDaysPerMonth ?? 1) / cfg.regularHoursPerDay;
}

/**
 * Computes a worker's payslip for a pay period. All amounts are integer paise.
 * Only shifts whose checkIn falls inside [period.start, period.end) are counted.
 */
export function computePayslip(
  worker: Worker,
  shifts: Shift[],
  period: PayPeriod,
  cfg: IndustryConfig,
): Payslip {
  const startMs = toMs(period.start);
  const endMs = toMs(period.end);
  const inPeriod = shifts.filter((s) => {
    const t = toMs(s.checkIn);
    return t >= startMs && t < endMs;
  });
  const summary = summarisePeriod(inPeriod, cfg);

  let baseParams: Record<string, number>;
  let base: number;
  if (cfg.payModel === 'daily') {
    const dailyWage = cfg.dailyWage ?? 0;
    base = Math.round(dailyWage * summary.daysWorked);
    baseParams = { days: summary.daysWorked, rate: dailyWage };
  } else {
    const salary = cfg.monthlySalary ?? 0;
    const workingDays = cfg.workingDaysPerMonth ?? 1;
    const dayRate = salary / workingDays;
    const absentDays = Math.max(0, period.workingDays - summary.daysWorked);
    base = Math.max(0, Math.round(salary - absentDays * dayRate));
    baseParams = { salary, absentDays, dayRate };
  }

  const rate = Math.round(hourlyRate(cfg));
  const overtimeAmount = Math.round(summary.overtimeHours * rate * cfg.overtimeMultiplier);
  const nightAmount = Math.round(summary.nightHours * cfg.nightAllowancePerHour);

  const earnings: PayLine[] = [
    { key: 'pay.base', amount: base, kind: 'earning', params: baseParams },
    {
      key: 'pay.overtime',
      amount: overtimeAmount,
      kind: 'earning',
      params: { hours: summary.overtimeHours, rate, multiplier: cfg.overtimeMultiplier },
    },
    {
      key: 'pay.night',
      amount: nightAmount,
      kind: 'earning',
      params: { hours: summary.nightHours, rate: cfg.nightAllowancePerHour },
    },
  ];
  const gross = earnings.reduce((sum, line) => sum + line.amount, 0);

  const pfAmount = Math.min(Math.round((base * PF_PERCENT) / 100), PF_CAP_PAISE);
  const esiAmount = gross <= ESI_CUTOFF_PAISE ? Math.round((gross * ESI_PERCENT) / 100) : 0;
  const advance = worker.advanceThisPeriod ?? 0;

  const deductions: PayLine[] = [
    {
      key: 'pay.pf',
      amount: pfAmount,
      kind: 'deduction',
      params: { percent: PF_PERCENT, base, cap: PF_CAP_PAISE },
    },
    {
      key: 'pay.esi',
      amount: esiAmount,
      kind: 'deduction',
      params: { percent: ESI_PERCENT, gross },
    },
    { key: 'pay.advance', amount: advance, kind: 'deduction', params: {} },
  ];
  const totalDeductions = deductions.reduce((sum, line) => sum + line.amount, 0);

  return {
    workerId: worker.id,
    period,
    industry: cfg.id,
    lines: [...earnings, ...deductions],
    gross,
    deductions: totalDeductions,
    net: gross - totalDeductions,
    summary,
  };
}
