import type { PaymentLedger } from '../../shared/payments';
import type {
  CorrectionLedger,
  DayOff,
  FeedbackResponse,
  PassportEntry,
  Report,
  Shift,
  Site,
  Worker,
} from '../../shared/types';

/** Filter for shift queries. All fields are optional and combined with AND. */
export interface ShiftQuery {
  workerId?: string;
  siteId?: string;
  /** ISO instant; only shifts with checkIn at or after this time are returned. */
  since?: string;
}

/**
 * Persistence boundary. Implementations: memory (tests, local dev) and Firestore (Cloud Run).
 * Methods return copies, so callers can never mutate stored state by accident.
 */
export interface Repo {
  listSites(): Promise<Site[]>;
  getSite(id: string): Promise<Site | null>;
  saveSite(site: Site): Promise<void>;

  /** Returns workers and admins of a site, sorted by id. */
  listWorkers(siteId: string): Promise<Worker[]>;
  getWorker(id: string): Promise<Worker | null>;
  saveWorker(worker: Worker): Promise<void>;

  listShifts(query: ShiftQuery): Promise<Shift[]>;
  /** The worker's shift with no check-out time, if any. */
  getOpenShift(workerId: string): Promise<Shift | null>;
  saveShift(shift: Shift): Promise<void>;
  /** Saves a new open shift only if the worker has none open. False when one already is. */
  startShift(shift: Shift): Promise<boolean>;

  listDaysOff(siteId: string): Promise<DayOff[]>;
  saveDayOff(day: DayOff): Promise<void>;

  listCorrectionLedgers(siteId: string): Promise<CorrectionLedger[]>;
  /** Compare-and-swap. expectedVersion=0 creates a ledger only when absent. */
  saveCorrectionLedger(ledger: CorrectionLedger, expectedVersion: number): Promise<boolean>;

  listPaymentLedgers(siteId: string): Promise<PaymentLedger[]>;
  /** Append/review a payment receipt only when the previous ledger version still matches. */
  savePaymentLedger(ledger: PaymentLedger, expectedVersion: number): Promise<boolean>;

  listReports(siteId: string): Promise<Report[]>;
  getReport(id: string): Promise<Report | null>;
  getReportByCode(caseCode: string): Promise<Report | null>;
  saveReport(report: Report): Promise<void>;
  /** Atomic report update; legacy records without a version are version zero. */
  compareAndSaveReport(report: Report, expectedVersion: number): Promise<boolean>;

  listFeedback(siteId: string): Promise<FeedbackResponse[]>;
  saveFeedback(response: FeedbackResponse): Promise<void>;
  /**
   * Atomically records a feedback dedupe key in its own set.
   * Returns false when the key was already present.
   */
  claimDedupeKey(key: string): Promise<boolean>;
  /** Frees a dedupe key claimed earlier, so the caller can retry after a failed save. */
  releaseDedupeKey(key: string): Promise<void>;

  listPassport(workerId: string): Promise<PassportEntry[]>;
  savePassport(entry: PassportEntry): Promise<void>;
}
