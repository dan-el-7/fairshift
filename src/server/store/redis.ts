import { Redis } from '@upstash/redis';
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

/**
 * The few Redis commands the store needs. Values are strings (the store serialises JSON itself),
 * so the same interface can be backed by Upstash REST in production and a Map in tests.
 */
export interface KvClient {
  /** Atomically updates the canonical report and its site-list index. */
  compareReportVersion(recordKey: string, siteKey: string, id: string, expectedVersion: number, value: string): Promise<boolean>;
  compareHashVersion(key: string, field: string, expectedVersion: number, value: string): Promise<boolean>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  /** Sets the key only when it does not exist. Resolves to 1 when set, 0 otherwise. */
  setnx(key: string, value: string): Promise<number>;
  hset(key: string, field: string, value: string): Promise<unknown>;
  hgetall(key: string): Promise<Record<string, string>>;
  /** Adds a member. Resolves to 1 when it was new, 0 when it was already present. */
  sadd(key: string, member: string): Promise<number>;
  smembers(key: string): Promise<string[]>;
  /** Removes a member. Resolves to 1 when it was present, 0 otherwise. */
  srem(key: string, member: string): Promise<number>;
  /** Deletes a key. Missing keys are not an error. */
  del(key: string): Promise<unknown>;
  /** Deletes every key starting with `prefix`. Used to refresh the demo data. */
  deletePrefix(prefix: string): Promise<number>;
  /** Sends many writes in as few round trips as possible. Optional: falls back to one call per write. */
  writeMany?(ops: WriteOp[]): Promise<void>;
}

/** A buffered write: the only commands the store's save methods use. */
export type WriteOp =
  | ['set', string, string]
  | ['hset', string, string, string]
  | ['sadd', string, string]
  | ['del', string];

/** Upstash accepts large pipelines, but smaller chunks keep each request well under its body limit. */
const PIPELINE_CHUNK = 200;

/**
 * With automatic deserialisation off, Upstash returns HGETALL as Redis does: a flat
 * [field, value, field, value, ...] array. Accept that, an object, or null.
 */
export function hashToRecord(raw: unknown): Record<string, string> {
  if (!raw) return {};
  if (!Array.isArray(raw)) return raw as Record<string, string>;
  const out: Record<string, string> = {};
  for (let i = 0; i + 1 < raw.length; i += 2) out[String(raw[i])] = String(raw[i + 1]);
  return out;
}

/** Upstash REST client (serverless-safe, works on Vercel and Cloud Run). */
export function createUpstashKv(url: string, token: string): KvClient {
  // Raw strings in and out: the store does its own JSON, so the client must not parse or rewrite values.
  const redis = new Redis({ url, token, automaticDeserialization: false });
  return {
    async compareReportVersion(recordKey, siteKey, id, expectedVersion, value) {
      const result = await redis.eval(`
        local raw = redis.call('GET', KEYS[1])
        if not raw then return 0 end
        local old = cjson.decode(raw)
        local next = cjson.decode(ARGV[3])
        if (old.version or 0) ~= tonumber(ARGV[2]) then return 0 end
        if old.siteId ~= next.siteId or old.caseCode ~= next.caseCode then return 0 end
        redis.call('SET', KEYS[1], ARGV[3])
        redis.call('HSET', KEYS[2], ARGV[1], ARGV[3])
        return 1
      `, [recordKey, siteKey], [id, expectedVersion, value]);
      return result === 1;
    },
    async compareHashVersion(key, field, expectedVersion, value) {
      const result = await redis.eval(`
        local raw = redis.call('HGET', KEYS[1], ARGV[1])
        local version = 0
        if raw then version = cjson.decode(raw).version or 0 end
        if version ~= tonumber(ARGV[2]) then return 0 end
        redis.call('HSET', KEYS[1], ARGV[1], ARGV[3])
        return 1
      `, [key], [field, expectedVersion, value]);
      return result === 1;
    },
    get: (key) => redis.get<string>(key),
    set: (key, value) => redis.set(key, value),
    setnx: (key, value) => redis.setnx(key, value),
    hset: (key, field, value) => redis.hset(key, { [field]: value }),
    hgetall: async (key) => hashToRecord(await redis.hgetall(key)),
    sadd: (key, member) => redis.sadd(key, member),
    smembers: (key) => redis.smembers(key),
    srem: (key, member) => redis.srem(key, member),
    del: (key) => redis.del(key),
    async deletePrefix(prefix) {
      let cursor = '0';
      let deleted = 0;
      do {
        const [next, keys] = await redis.scan(cursor, { match: `${prefix}*`, count: 500 });
        cursor = next;
        if (keys.length > 0) deleted += await redis.del(...keys);
      } while (cursor !== '0');
      return deleted;
    },
    async writeMany(ops) {
      for (let i = 0; i < ops.length; i += PIPELINE_CHUNK) {
        const pipe = redis.pipeline();
        for (const op of ops.slice(i, i + PIPELINE_CHUNK)) {
          if (op[0] === 'set') pipe.set(op[1], op[2]);
          else if (op[0] === 'hset') pipe.hset(op[1], { [op[2]]: op[3] });
          else if (op[0] === 'del') pipe.del(op[1]);
          else pipe.sadd(op[1], op[2]);
        }
        await pipe.exec();
      }
    },
  };
}

/**
 * Wraps a client so writes are queued instead of sent, then delivered together by `flush()`.
 * Used to seed the demo in a handful of round trips rather than hundreds. Reads pass through and
 * do not see queued writes, so only use it for write-only work such as seeding.
 */
export function bufferWrites(kv: KvClient): KvClient & { flush(): Promise<void> } {
  const queue: WriteOp[] = [];
  return {
    compareReportVersion: (recordKey, siteKey, id, version, value) => kv.compareReportVersion(recordKey, siteKey, id, version, value),
    compareHashVersion: (key, field, version, value) => kv.compareHashVersion(key, field, version, value),
    get: (key) => kv.get(key),
    hgetall: (key) => kv.hgetall(key),
    smembers: (key) => kv.smembers(key),
    setnx: (key, value) => kv.setnx(key, value),
    deletePrefix: (prefix) => kv.deletePrefix(prefix),
    set(key, value) {
      queue.push(['set', key, value]);
      return Promise.resolve();
    },
    hset(key, field, value) {
      queue.push(['hset', key, field, value]);
      return Promise.resolve();
    },
    sadd(key, member) {
      queue.push(['sadd', key, member]);
      return Promise.resolve(1);
    },
    del(key) {
      queue.push(['del', key]);
      return Promise.resolve(1);
    },
    srem: (key, member) => kv.srem(key, member),
    async flush() {
      const ops = queue.splice(0);
      if (kv.writeMany) return kv.writeMany(ops);
      for (const op of ops) {
        if (op[0] === 'set') await kv.set(op[1], op[2]);
        else if (op[0] === 'hset') await kv.hset(op[1], op[2], op[3]);
        else if (op[0] === 'del') await kv.del(op[1]);
        else await kv.sadd(op[1], op[2]);
      }
    },
  };
}

/** The Repo plus the bookkeeping for the shared demo data. */
export interface RedisRepo extends Repo {
  /** The IST day (YYYY-MM-DD) the demo data was generated for, or null if never seeded. */
  seededDay(): Promise<string | null>;
  /** Set only after a seed has fully succeeded, so a crash mid-seed is retried on the next cold start. */
  markSeeded(day: string): Promise<void>;
  /** Removes all FairShift keys, so a fresh seed does not mix with older generated shifts. */
  clear(): Promise<void>;
}

const openLockKey = (workerId: string): string => `fs:open-shift:${workerId}`;
const byId = <T extends { id: string }>(a: T, b: T): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const byCheckIn = (a: Shift, b: Shift): number => (a.checkIn < b.checkIn ? -1 : a.checkIn > b.checkIn ? 1 : 0);

async function readSites(kv: KvClient, ids: string[]): Promise<Site[]> {
  const rows = await Promise.all(ids.map((id) => kv.get(`fs:site:${id}`)));
  return rows.flatMap((r) => r === null ? [] : [JSON.parse(r) as Site]);
}

async function saveReportRecord(kv: KvClient, report: Report): Promise<void> {
  await kv.set(`fs:report:${report.id}`, JSON.stringify(report));
  await kv.hset(`fs:reports:${report.siteId}`, report.id, JSON.stringify(report));
  await kv.set(`fs:report-code:${report.caseCode}`, report.id);
}

function updateReport(kv: KvClient, report: Report, expectedVersion: number): Promise<boolean> {
  if (report.version !== expectedVersion + 1) return Promise.resolve(false);
  return kv.compareReportVersion(`fs:report:${report.id}`, `fs:reports:${report.siteId}`, report.id, expectedVersion, JSON.stringify(report));
}

function savePayment(kv: KvClient, ledger: PaymentLedger, expectedVersion: number): Promise<boolean> {
  if (ledger.version !== expectedVersion + 1) return Promise.resolve(false);
  return kv.compareHashVersion(`fs:payments:${ledger.siteId}`, ledger.workerId, expectedVersion, JSON.stringify(ledger));
}

/**
 * Redis-backed repository. Key layout (all prefixed `fs:`):
 *   site:{id}                 JSON site          sites                  set of site ids
 *   worker:{id}               JSON worker        workers:{siteId}       hash id -> worker
 *   worker-ids                set of worker ids (for cross-worker shift queries)
 *   shifts:{workerId}         hash id -> shift
 *   report:{id}               JSON report        reports:{siteId}       hash id -> report
 *   report-code:{caseCode}    report id
 *   feedback:{siteId}:{month} hash id -> response   feedback-months:{siteId} set of months
 *   feedback-keys             set of dedupe keys
 *   open-shift:{workerId}     id of the worker's open shift (check-in lock, see startShift)
 *   passport:{workerId}       hash id -> entry
 *   seeded                    timestamp of the one-time demo seed
 * Reports and feedback are stored exactly as the memory repo keeps them: no worker id.
 */
export function createRedisRepo(kv: KvClient): RedisRepo {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- callers name the stored type; JSON.parse is untyped
  const json = <T>(text: string): T => JSON.parse(text) as T;
  const values = <T>(hash: Record<string, string>): T[] => Object.values(hash).map((v) => json<T>(v));

  async function getReport(id: string): Promise<Report | null> {
    const raw = await kv.get(`fs:report:${id}`);
    return raw === null ? null : json<Report>(raw);
  }


  async function openShiftOf(workerId: string): Promise<Shift | null> {
    const open = values<Shift>(await kv.hgetall(`fs:shifts:${workerId}`)).find((s) => s.checkOut === null);
    return open ?? null;
  }

  async function saveShiftRecord(shift: Shift): Promise<void> {
    await kv.hset(`fs:shifts:${shift.workerId}`, shift.id, JSON.stringify(shift));
    await kv.sadd('fs:worker-ids', shift.workerId);
    // The lock follows the open shift: present while it is open, removed when it is closed.
    // Closing removes it without checking the id, which is safe because check-out only closes
    // the worker's current open shift.
    if (shift.checkOut === null) await kv.set(openLockKey(shift.workerId), shift.id);
    else await kv.del(openLockKey(shift.workerId));
  }

  return {
    async listPaymentLedgers(siteId) {
      return values<PaymentLedger>(await kv.hgetall(`fs:payments:${siteId}`));
    },
    savePaymentLedger: (ledger, expectedVersion) => savePayment(kv, ledger, expectedVersion),
    async seededDay() {
      const value = await kv.get('fs:seeded');
      return value === null ? null : value.slice(0, 10);
    },

    async markSeeded(day) {
      await kv.set('fs:seeded', day);
    },

    async clear() {
      await kv.deletePrefix('fs:');
    },

    async listSites() {
      const sites = await readSites(kv, await kv.smembers('fs:sites'));
      return sites.sort(byId);
    },
    async listDaysOff(siteId) {
      return values<DayOff>(await kv.hgetall(`fs:days-off:${siteId}`)).filter((d) => d.active);
    },
    async listCorrectionLedgers(siteId) {
      return values<CorrectionLedger>(await kv.hgetall(`fs:corrections:${siteId}`));
    },
    saveCorrectionLedger(ledger, expectedVersion) {
      return kv.compareHashVersion(`fs:corrections:${ledger.siteId}`, ledger.workerId, expectedVersion, JSON.stringify(ledger));
    },
    async saveDayOff(day) {
      await kv.hset(`fs:days-off:${day.siteId}`, day.day, JSON.stringify(day));
    },
    async getSite(id) {
      const raw = await kv.get(`fs:site:${id}`);
      return raw === null ? null : json<Site>(raw);
    },
    async saveSite(site) {
      await kv.set(`fs:site:${site.id}`, JSON.stringify(site));
      await kv.sadd('fs:sites', site.id);
    },

    async listWorkers(siteId) {
      return values<Worker>(await kv.hgetall(`fs:workers:${siteId}`)).sort(byId);
    },
    async getWorker(id) {
      const raw = await kv.get(`fs:worker:${id}`);
      return raw === null ? null : json<Worker>(raw);
    },
    async saveWorker(worker) {
      await kv.set(`fs:worker:${worker.id}`, JSON.stringify(worker));
      await kv.hset(`fs:workers:${worker.siteId}`, worker.id, JSON.stringify(worker));
      await kv.sadd('fs:worker-ids', worker.id);
    },

    async listShifts(query: ShiftQuery) {
      const workerIds = query.workerId !== undefined ? [query.workerId] : await kv.smembers('fs:worker-ids');
      const sinceMs = query.since === undefined ? null : Date.parse(query.since);
      const groups = await Promise.all(workerIds.map((id) => kv.hgetall(`fs:shifts:${id}`)));
      return groups
        .flatMap((hash) => values<Shift>(hash))
        .filter((s) => query.siteId === undefined || s.siteId === query.siteId)
        .filter((s) => sinceMs === null || Date.parse(s.checkIn) >= sinceMs)
        .sort(byCheckIn);
    },
    getOpenShift: openShiftOf,
    saveShift: saveShiftRecord,
    async startShift(shift) {
      if ((await openShiftOf(shift.workerId)) !== null) return false;
      // SETNX is the atomic gate: of two concurrent check-ins, only one creates the lock.
      if ((await kv.setnx(openLockKey(shift.workerId), shift.id)) === 0) return false;
      await saveShiftRecord(shift);
      return true;
    },

    async listReports(siteId) {
      return values<Report>(await kv.hgetall(`fs:reports:${siteId}`)).sort(byId);
    },
    getReport,
    async getReportByCode(caseCode) {
      const id = await kv.get(`fs:report-code:${caseCode}`);
      return id === null ? null : getReport(id);
    },
    saveReport: (report) => saveReportRecord(kv, report),
    compareAndSaveReport: (report, expectedVersion) => updateReport(kv, report, expectedVersion),

    async listFeedback(siteId) {
      const months = await kv.smembers(`fs:feedback-months:${siteId}`);
      const hashes = await Promise.all(months.map((m) => kv.hgetall(`fs:feedback:${siteId}:${m}`)));
      return hashes.flatMap((hash) => values<FeedbackResponse>(hash)).sort(byId);
    },
    async saveFeedback(response) {
      await kv.hset(`fs:feedback:${response.siteId}:${response.month}`, response.id, JSON.stringify(response));
      await kv.sadd(`fs:feedback-months:${response.siteId}`, response.month);
    },
    async claimDedupeKey(key) {
      return (await kv.sadd('fs:feedback-keys', key)) === 1;
    },
    async releaseDedupeKey(key) {
      await kv.srem('fs:feedback-keys', key);
    },

    async listPassport(workerId) {
      return values<PassportEntry>(await kv.hgetall(`fs:passport:${workerId}`)).sort(byId);
    },
    async savePassport(entry) {
      await kv.hset(`fs:passport:${entry.workerId}`, entry.id, JSON.stringify(entry));
    },
  };
}
