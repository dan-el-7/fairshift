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
    async listSites() {
      return [...sites.values()].sort(byId).map(copy);
    },
    async getSite(id) {
      const site = sites.get(id);
      return site ? copy(site) : null;
    },
    async saveSite(site) {
      sites.set(site.id, copy(site));
    },

    async listWorkers(siteId) {
      return [...workers.values()].filter((w) => w.siteId === siteId).sort(byId).map(copy);
    },
    async getWorker(id) {
      const worker = workers.get(id);
      return worker ? copy(worker) : null;
    },
    async saveWorker(worker) {
      workers.set(worker.id, copy(worker));
    },

    async listShifts(query: ShiftQuery) {
      const sinceMs = query.since === undefined ? null : Date.parse(query.since);
      return [...shifts.values()]
        .filter((s) => query.workerId === undefined || s.workerId === query.workerId)
        .filter((s) => query.siteId === undefined || s.siteId === query.siteId)
        .filter((s) => sinceMs === null || Date.parse(s.checkIn) >= sinceMs)
        .sort((a, b) => (a.checkIn < b.checkIn ? -1 : a.checkIn > b.checkIn ? 1 : 0))
        .map(copy);
    },
    async getOpenShift(workerId) {
      const open = [...shifts.values()].find((s) => s.workerId === workerId && s.checkOut === null);
      return open ? copy(open) : null;
    },
    async saveShift(shift) {
      shifts.set(shift.id, copy(shift));
    },

    async listReports(siteId) {
      return [...reports.values()].filter((r) => r.siteId === siteId).sort(byId).map(copy);
    },
    async getReport(id) {
      const report = reports.get(id);
      return report ? copy(report) : null;
    },
    async getReportByCode(caseCode) {
      const report = [...reports.values()].find((r) => r.caseCode === caseCode);
      return report ? copy(report) : null;
    },
    async saveReport(report) {
      reports.set(report.id, copy(report));
    },

    async listFeedback(siteId) {
      return feedback.filter((f) => f.siteId === siteId).map(copy);
    },
    async saveFeedback(response) {
      feedback.push(copy(response));
    },
    async claimDedupeKey(key) {
      if (dedupeKeys.has(key)) return false;
      dedupeKeys.add(key);
      return true;
    },

    async listPassport(workerId) {
      return [...passport.values()].filter((e) => e.workerId === workerId).sort(byId).map(copy);
    },
    async savePassport(entry) {
      passport.set(entry.id, copy(entry));
    },
  };
}
