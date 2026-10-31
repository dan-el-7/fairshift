import type { CorrectionLedger, CorrectionRequest, Payslip, Shift } from '../../shared/types';
import type { Repo } from '../store/repo';
import { istDay } from '../domain/time';

export function approvedRevision(ledger: CorrectionLedger, day: string): string {
  return ledger.requests.filter((r) => r.day === day && r.status === 'approved').at(-1)?.id ?? 'original';
}

/** Raw shifts stay untouched. All read paths use the same approved overlay. */
export function applyCorrections(shifts: Shift[], ledgers: CorrectionLedger[]): Shift[] {
  const effective = new Map(shifts.map((s) => [s.id, s]));
  for (const ledger of ledgers) for (const request of ledger.requests) {
    if (request.status !== 'approved' || request.kind !== 'shift' || !request.checkIn || !request.checkOut) continue;
    const id = request.shiftId ?? `correction-${request.id}`;
    effective.set(id, { id, workerId: ledger.workerId, siteId: ledger.siteId, checkIn: request.checkIn, checkOut: request.checkOut, method: request.originalShift?.method ?? 'correction' });
  }
  return [...effective.values()].sort((a, b) => a.checkIn.localeCompare(b.checkIn));
}

export async function effectiveWork(repo: Repo, siteId: string, workerId?: string) {
  // ponytail: site-sized histories are loaded together; index by worker/month when history grows.
  const [raw, all] = await Promise.all([repo.listShifts({ siteId, ...(workerId ? { workerId } : {}) }), repo.listCorrectionLedgers(siteId)]);
  const ledgers = all.filter((l) => workerId === undefined || l.workerId === workerId);
  return { shifts: applyCorrections(raw, ledgers), ledgers };
}

/** Approved pay changes are explicit net adjustments, after the standard payroll calculation. */
export function adjustedPayslip(slip: Payslip, ledgers: CorrectionLedger[]): Payslip {
  const adjustments = ledgers.filter((l) => l.workerId === slip.workerId).flatMap((l) => l.requests)
    .filter((r) => r.kind === 'pay' && r.status === 'approved' && r.day.startsWith(slip.period.id))
    .map((r) => ({ day: r.day, amount: r.amount ?? 0, reason: r.reviewReason ?? r.reason }));
  if (adjustments.length === 0) return slip;
  return { ...slip, adjustments, net: slip.net + adjustments.reduce((sum, a) => sum + a.amount, 0) };
}

export async function approvalProblem(repo: Repo, ledger: CorrectionLedger, request: CorrectionRequest, now: Date): Promise<string | null> {
  if (request.basedOn !== approvedRevision(ledger, request.day)) return 'stale proposal; reject and ask worker to resubmit';
  if (request.kind !== 'shift') return null;
  const work = await effectiveWork(repo, ledger.siteId, ledger.workerId);
  const current = work.shifts.find((s) => s.id === request.shiftId);
  if (request.originalShift && (current?.checkIn !== request.originalShift.checkIn || current.checkOut !== request.originalShift.checkOut)) return 'original shift changed; resubmit';
  return shiftProposalProblem(request, work.shifts, now);
}

export function shiftProposalProblem(request: Pick<CorrectionRequest, 'day' | 'shiftId' | 'checkIn' | 'checkOut'>, shifts: Shift[], now: Date): string | null {
  if (!request.checkIn || !request.checkOut) return 'times required';
  const start = Date.parse(request.checkIn), end = Date.parse(request.checkOut);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 86_400_000 || end > now.getTime()) return 'invalid shift times';
  if (istDay(new Date(start)) !== request.day) return 'check-in must match the selected day';
  const original = request.shiftId ? shifts.find((s) => s.id === request.shiftId) : undefined;
  if (request.shiftId && (!original?.checkOut || istDay(new Date(original.checkIn)) !== request.day)) return 'select a completed shift on this day';
  const overlap = shifts.some((s) => s.id !== request.shiftId && start < (s.checkOut ? Date.parse(s.checkOut) : Infinity) && end > Date.parse(s.checkIn));
  return overlap ? 'proposed shift overlaps recorded work' : null;
}
