import type {
  FeedbackResponse,
  PassportEntry,
  Report,
  Shift,
  Site,
  Worker,
} from '../../shared/types';
import type { Repo, ShiftQuery } from './repo';

/** Creates an in-process repository. Data lives only as long as the process. */
export function createMemoryRepo(): Repo {
  const sites = new Map<string, Site>();
  const workers = new Map<string, Worker>();
  const shifts = new Map<string, Shift>();
  const reports = new Map<string, Report>();
  const feedback: FeedbackResponse[] = [];
  const dedupeKeys = new Set<string>();
  const passport = new Map<string, PassportEntry>();

  const copy = <T>(value: T): T => structuredClone(value);
  const byId = <T extends { id: string }>(a: T, b: T): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

  return {
    listSites() {
      return Promise.resolve([...sites.values()].sort(byId).map(copy));
    },
    getSite(id) {
      const site = sites.get(id);
      return Promise.resolve(site ? copy(site) : null);
    },
    saveSite(site) {
      sites.set(site.id, copy(site));
      return Promise.resolve();
    },

    listWorkers(siteId) {
      return Promise.resolve([...workers.values()].filter((w) => w.siteId === siteId).sort(byId).map(copy));
    },
    getWorker(id) {
      const worker = workers.get(id);
      return Promise.resolve(worker ? copy(worker) : null);
    },
    saveWorker(worker) {
      workers.set(worker.id, copy(worker));
      return Promise.resolve();
    },

    listShifts(query: ShiftQuery) {
      const sinceMs = query.since === undefined ? null : Date.parse(query.since);
      return Promise.resolve(
        [...shifts.values()]
          .filter((s) => query.workerId === undefined || s.workerId === query.workerId)
          .filter((s) => query.siteId === undefined || s.siteId === query.siteId)
          .filter((s) => sinceMs === null || Date.parse(s.checkIn) >= sinceMs)
          .sort((a, b) => (a.checkIn < b.checkIn ? -1 : a.checkIn > b.checkIn ? 1 : 0))
          .map(copy),
      );
    },
    getOpenShift(workerId) {
      const open = [...shifts.values()].find((s) => s.workerId === workerId && s.checkOut === null);
      return Promise.resolve(open ? copy(open) : null);
    },
    saveShift(shift) {
      shifts.set(shift.id, copy(shift));
      return Promise.resolve();
    },
    startShift(shift) {
      // Check and set run synchronously, so no other request can interleave between them.
      const alreadyOpen = [...shifts.values()].some((s) => s.workerId === shift.workerId && s.checkOut === null);
      if (alreadyOpen) return Promise.resolve(false);
      shifts.set(shift.id, copy(shift));
      return Promise.resolve(true);
    },

    listReports(siteId) {
      return Promise.resolve([...reports.values()].filter((r) => r.siteId === siteId).sort(byId).map(copy));
    },
    getReport(id) {
      const report = reports.get(id);
      return Promise.resolve(report ? copy(report) : null);
    },
    getReportByCode(caseCode) {
      const report = [...reports.values()].find((r) => r.caseCode === caseCode);
      return Promise.resolve(report ? copy(report) : null);
    },
    saveReport(report) {
      reports.set(report.id, copy(report));
      return Promise.resolve();
    },

    listFeedback(siteId) {
      return Promise.resolve(feedback.filter((f) => f.siteId === siteId).map(copy));
    },
    saveFeedback(response) {
      feedback.push(copy(response));
      return Promise.resolve();
    },
    claimDedupeKey(key) {
      if (dedupeKeys.has(key)) return Promise.resolve(false);
      dedupeKeys.add(key);
      return Promise.resolve(true);
    },
    releaseDedupeKey(key) {
      dedupeKeys.delete(key);
      return Promise.resolve();
    },

    listPassport(workerId) {
      return Promise.resolve([...passport.values()].filter((e) => e.workerId === workerId).sort(byId).map(copy));
    },
    savePassport(entry) {
      passport.set(entry.id, copy(entry));
      return Promise.resolve();
    },
  };
}
