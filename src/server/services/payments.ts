import type { PaymentLedger, PaymentSummary } from '../../shared/payments';
import type { Worker } from '../../shared/types';
import { computePayslip } from '../domain/payroll';
import { istDay } from '../domain/time';
import { payPeriod } from './calendar';
import { adjustedPayslip, effectiveWork } from './corrections';
import type { Repo } from '../store/repo';

export function emptyPaymentLedger(workerId: string, siteId: string): PaymentLedger {
  return { workerId, siteId, version: 0, records: [], confirmations: [] };
}

/** Calculates entitlement exclusively from server-owned payroll inputs. */
export async function paymentSummary(repo: Repo, worker: Worker, cfg: Parameters<typeof computePayslip>[3], period: string, now: Date): Promise<PaymentSummary> {
  const today = istDay(now);
  const work = await effectiveWork(repo, worker.siteId, worker.id);
  const slip = adjustedPayslip(computePayslip(worker, work.shifts, payPeriod(period, today), cfg), work.ledgers);
  const ledgers = await repo.listPaymentLedgers(worker.siteId);
  const ledger = ledgers.find((entry) => entry.workerId === worker.id) ?? emptyPaymentLedger(worker.id, worker.siteId);
  const records = ledger.records.filter((entry) => entry.period === period);
  const recorded = records.reduce((total, entry) => total + entry.amount, 0);
  return {
    period, expected: slip.net, recorded, outstanding: Math.max(0, slip.net - recorded),
    overpaid: Math.max(0, recorded - slip.net), hasRecordedPayment: records.length > 0,
    ledgerVersion: ledger.version,
    records: records.map((entry) => ({ ...entry, confirmation: ledger.confirmations.find((c) => c.recordId === entry.id) })),
  };
}
