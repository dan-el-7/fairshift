import { Firestore, type CollectionReference, type Query } from '@google-cloud/firestore';
import type {
  FeedbackResponse,
  PassportEntry,
  Report,
  Shift,
  Site,
  Worker,
} from '../../shared/types';
import type { Repo, ShiftQuery } from './repo';

const ALREADY_EXISTS = 6;

/** Firestore rejects undefined fields; a JSON round trip drops them and gives a plain object. */
function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
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

  async function put<T extends object>(name: string, id: string, value: T): Promise<void> {
    await col<T>(name).doc(id).set(plain(value));
  }

  return {
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
    async getOpenShift(workerId) {
      const open = await all(
        col<Shift>('shifts').where('workerId', '==', workerId).where('checkOut', '==', null).limit(1),
      );
      return open[0] ?? null;
    },
    saveShift: (shift) => put('shifts', shift.id, shift),

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

    listFeedback: (siteId) => all(col<FeedbackResponse>('feedback').where('siteId', '==', siteId)),
    saveFeedback: (response) => put('feedback', response.id, response),
    async claimDedupeKey(key) {
      try {
        await col<{ claimedAt: string }>('feedbackKeys')
          .doc(key)
          .create({ claimedAt: new Date().toISOString() });
        return true;
      } catch (err) {
        if (typeof err === 'object' && err !== null && 'code' in err && err.code === ALREADY_EXISTS) return false;
        throw err;
      }
    },

    async listPassport(workerId) {
      const entries = await all(col<PassportEntry>('passport').where('workerId', '==', workerId));
      return entries.sort((a, b) => a.id.localeCompare(b.id));
    },
    savePassport: (entry) => put('passport', entry.id, entry),
  };
}
