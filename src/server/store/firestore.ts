import { Firestore, type CollectionReference, type DocumentReference, type Query } from '@google-cloud/firestore';
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
import type { Repo, ShiftQuery } from './repo';

const ALREADY_EXISTS = 6;

/** Document in the openShifts collection, keyed by worker id: its presence means the worker is checked in. */
interface OpenLock {
  shiftId: string;
}

function isAlreadyExists(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === ALREADY_EXISTS;
}

/** Firestore rejects undefined fields; a JSON round trip drops them and gives a plain object. */
function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function savePayment(db: Firestore, ledger: PaymentLedger, expectedVersion: number): Promise<boolean> {
  if (ledger.version !== expectedVersion + 1) return Promise.resolve(false);
  return db.runTransaction(async (tx) => {
    const ref = db.collection('payments').doc(ledger.workerId) as DocumentReference<PaymentLedger>;
    const previous = (await tx.get(ref)).data();
    if ((previous?.version ?? 0) !== expectedVersion || (previous && previous.siteId !== ledger.siteId)) return false;
    tx.set(ref, plain(ledger));
    return true;
  });
}

function updateReport(db: Firestore, report: Report, expectedVersion: number): Promise<boolean> {
  if (report.version !== expectedVersion + 1) return Promise.resolve(false);
  return db.runTransaction(async (tx) => {
    const ref = db.collection('reports').doc(report.id) as DocumentReference<Report>;
    const previous = (await tx.get(ref)).data();
    if (!previous || (previous.version ?? 0) !== expectedVersion || previous.siteId !== report.siteId || previous.caseCode !== report.caseCode) return false;
    tx.set(ref, plain(report));
    return true;
  });
}

/**
 * Firestore-backed repository. One collection per entity; feedback dedupe keys live in their
 * own collection so they are never stored alongside a response. Filters beyond simple equality
 * are applied in code, which is fine at demo and single-site scale.
 */
export function createFirestoreRepo(db: Firestore = new Firestore()): Repo {
  const col = <T extends object>(name: string): CollectionReference<T> =>
    db.collection(name) as CollectionReference<T>;

  async function all<T extends object>(query: Query<T>): Promise<T[]> {
    const snap = await query.get();
    return snap.docs.map((d) => d.data());
  }

  async function one<T extends object>(name: string, id: string): Promise<T | null> {
    const snap = await col<T>(name).doc(id).get();
    return snap.data() ?? null;
  }

  async function put(name: string, id: string, value: object): Promise<void> {
    await col<object>(name).doc(id).set(plain(value));
  }

  async function openShiftOf(workerId: string): Promise<Shift | null> {
    const open = await all(
      col<Shift>('shifts').where('workerId', '==', workerId).where('checkOut', '==', null).limit(1),
    );
    return open[0] ?? null;
  }

  return {
    listPaymentLedgers: (siteId) => all(col<PaymentLedger>('payments').where('siteId', '==', siteId)),
    savePaymentLedger: (ledger, expectedVersion) => savePayment(db, ledger, expectedVersion),
    listCorrectionLedgers: (siteId) => all(col<CorrectionLedger>('corrections').where('siteId', '==', siteId)),
    saveCorrectionLedger(ledger, expectedVersion) {
      return db.runTransaction(async (tx) => {
        const ref = col<CorrectionLedger>('corrections').doc(ledger.workerId);
        const previous = (await tx.get(ref)).data();
        if ((previous?.version ?? 0) !== expectedVersion) return false;
        tx.set(ref, plain(ledger));
        return true;
      });
    },
    async listDaysOff(siteId) {
      return (await all(col<DayOff>('daysOff').where('siteId', '==', siteId))).filter((d) => d.active);
    },
    saveDayOff: (day) => put('daysOff', `${day.siteId}_${day.day}`, day),
    async listSites() {
      const sites = await all(col<Site>('sites'));
      return sites.sort((a, b) => a.id.localeCompare(b.id));
    },
    getSite: (id) => one<Site>('sites', id),
    saveSite: (site) => put('sites', site.id, site),

    async listWorkers(siteId) {
      const workers = await all(col<Worker>('workers').where('siteId', '==', siteId));
      return workers.sort((a, b) => a.id.localeCompare(b.id));
    },
    getWorker: (id) => one<Worker>('workers', id),
    saveWorker: (worker) => put('workers', worker.id, worker),

    async listShifts(query: ShiftQuery) {
      const base = col<Shift>('shifts');
      const ref: Query<Shift> =
        query.workerId !== undefined
          ? base.where('workerId', '==', query.workerId)
          : query.siteId !== undefined
            ? base.where('siteId', '==', query.siteId)
            : base;
      const sinceMs = query.since === undefined ? null : Date.parse(query.since);
      const shifts = await all(ref);
      return shifts
        .filter((s) => query.siteId === undefined || s.siteId === query.siteId)
        .filter((s) => query.workerId === undefined || s.workerId === query.workerId)
        .filter((s) => sinceMs === null || Date.parse(s.checkIn) >= sinceMs)
        .sort((a, b) => a.checkIn.localeCompare(b.checkIn));
    },
    getOpenShift: openShiftOf,
    async saveShift(shift) {
      await put('shifts', shift.id, shift);
      // The open-shift lock follows the open shift: set while open, deleted when closed (see startShift).
      const lock = col<OpenLock>('openShifts').doc(shift.workerId);
      if (shift.checkOut === null) await lock.set({ shiftId: shift.id });
      else await lock.delete();
    },
    async startShift(shift) {
      if ((await openShiftOf(shift.workerId)) !== null) return false;
      try {
        // create() fails when the lock exists, so of two concurrent check-ins only one gets it.
        await col<OpenLock>('openShifts').doc(shift.workerId).create({ shiftId: shift.id });
      } catch (err) {
        if (isAlreadyExists(err)) return false;
        throw err;
      }
      await put('shifts', shift.id, shift);
      return true;
    },

    async listReports(siteId) {
      const reports = await all(col<Report>('reports').where('siteId', '==', siteId));
      return reports.sort((a, b) => a.id.localeCompare(b.id));
    },
    getReport: (id) => one<Report>('reports', id),
    async getReportByCode(caseCode) {
      const found = await all(col<Report>('reports').where('caseCode', '==', caseCode).limit(1));
      return found[0] ?? null;
    },
    saveReport: (report) => put('reports', report.id, report),
    compareAndSaveReport: (report, expectedVersion) => updateReport(db, report, expectedVersion),

    listFeedback: (siteId) => all(col<FeedbackResponse>('feedback').where('siteId', '==', siteId)),
    saveFeedback: (response) => put('feedback', response.id, response),
    async claimDedupeKey(key) {
      try {
        await col<{ claimedAt: string }>('feedbackKeys')
          .doc(key)
          .create({ claimedAt: new Date().toISOString() });
        return true;
      } catch (err) {
        if (isAlreadyExists(err)) return false;
        throw err;
      }
    },
    async releaseDedupeKey(key) {
      await col<{ claimedAt: string }>('feedbackKeys').doc(key).delete();
    },

    async listPassport(workerId) {
      const entries = await all(col<PassportEntry>('passport').where('workerId', '==', workerId));
      return entries.sort((a, b) => a.id.localeCompare(b.id));
    },
    savePassport: (entry) => put('passport', entry.id, entry),
  };
}
