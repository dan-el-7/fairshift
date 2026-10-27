import type { KvClient } from '../../../src/server/store/redis';

/** In-memory stand-in for the Upstash client, with the same string-in, string-out contract. */
export interface FakeKv extends KvClient {
  /** Every key and value written so far, for raw-storage assertions. */
  dump(): Array<[string, string]>;
}

export function createFakeKv(): FakeKv {
  const strings = new Map<string, string>();
  const hashes = new Map<string, Map<string, string>>();
  const sets = new Map<string, Set<string>>();

  return {
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
    dump() {
      const out: Array<[string, string]> = [...strings];
      for (const [key, hash] of hashes) for (const value of hash.values()) out.push([key, value]);
      for (const [key, set] of sets) for (const member of set) out.push([key, member]);
      return out;
    },
  };
}
