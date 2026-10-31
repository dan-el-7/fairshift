import type { KvClient } from '../../../src/server/store/redis';

/** In-memory stand-in for the Upstash client, with the same string-in, string-out contract. */
export interface FakeKv extends KvClient {
  /** Every key and value written so far, for raw-storage assertions. */
  dump(): [string, string][];
}

export function createFakeKv(): FakeKv {
  const strings = new Map<string, string>();
  const hashes = new Map<string, Map<string, string>>();
  const sets = new Map<string, Set<string>>();

  return {
    async compareReportVersion(recordKey, siteKey, id, expectedVersion, value) {
      const raw = strings.get(recordKey);
      if (!raw) return false;
      const previous = JSON.parse(raw) as { version?: number; siteId: string; caseCode: string };
      const next = JSON.parse(value) as { siteId: string; caseCode: string };
      if ((previous.version ?? 0) !== expectedVersion || previous.siteId !== next.siteId || previous.caseCode !== next.caseCode) return false;
      strings.set(recordKey, value);
      const hash = hashes.get(siteKey) ?? new Map<string, string>();
      hash.set(id, value);
      hashes.set(siteKey, hash);
      return true;
    },
    async compareHashVersion(key, field, expectedVersion, value) {
      const hash = hashes.get(key) ?? new Map<string, string>();
      const raw = hash.get(field);
      const previous = raw ? JSON.parse(raw) as { version: number } : undefined;
      if ((previous?.version ?? 0) !== expectedVersion) return false;
      hash.set(field, value);
      hashes.set(key, hash);
      return true;
    },
    async get(key) {
      return strings.get(key) ?? null;
    },
    async set(key, value) {
      strings.set(key, value);
      return 'OK';
    },
    async setnx(key, value) {
      if (strings.has(key)) return 0;
      strings.set(key, value);
      return 1;
    },
    async hset(key, field, value) {
      const hash = hashes.get(key) ?? new Map<string, string>();
      hash.set(field, value);
      hashes.set(key, hash);
      return 1;
    },
    async hgetall(key) {
      return Object.fromEntries(hashes.get(key) ?? []);
    },
    async sadd(key, member) {
      const set = sets.get(key) ?? new Set<string>();
      sets.set(key, set);
      if (set.has(member)) return 0;
      set.add(member);
      return 1;
    },
    async smembers(key) {
      return [...(sets.get(key) ?? [])];
    },
    async srem(key, member) {
      return sets.get(key)?.delete(member) ? 1 : 0;
    },
    async del(key) {
      const existed = strings.delete(key);
      return existed ? 1 : 0;
    },
    async deletePrefix(prefix) {
      let deleted = 0;
      for (const store of [strings, hashes, sets] as Map<string, unknown>[]) {
        for (const key of [...store.keys()]) {
          if (key.startsWith(prefix)) {
            store.delete(key);
            deleted += 1;
          }
        }
      }
      return deleted;
    },
    dump() {
      const out: [string, string][] = [...strings];
      for (const [key, hash] of hashes) for (const value of hash.values()) out.push([key, value]);
      for (const [key, set] of sets) for (const member of set) out.push([key, member]);
      return out;
    },
  };
}
