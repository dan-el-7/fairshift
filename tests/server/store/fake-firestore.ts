import type { Firestore } from '@google-cloud/firestore';

type Row = Record<string, unknown>;
type Filter = [field: string, value: unknown];

/**
 * Minimal Firestore double: the collection/doc/query calls that firestore.ts makes, with
 * equality filters, limit, get, set and create (ALREADY_EXISTS code 6 on a second create).
 */
export function createFakeFirestore(): Firestore {
  const collections = new Map<string, Map<string, Row>>();
  const coll = (name: string): Map<string, Row> => {
    const existing = collections.get(name);
    if (existing) return existing;
    const created = new Map<string, Row>();
    collections.set(name, created);
    return created;
  };
  const snapshot = (row: Row | undefined) => ({ data: () => (row ? structuredClone(row) : undefined) });

  const query = (name: string, filters: Filter[], limit?: number) => ({
    where: (field: string, _op: string, value: unknown) => query(name, [...filters, [field, value]], limit),
    limit: (n: number) => query(name, filters, n),
    get: async () => {
      let rows = [...coll(name).values()].filter((r) => filters.every(([f, v]) => (r[f] ?? null) === v));
      if (limit !== undefined) rows = rows.slice(0, limit);
      return { docs: rows.map((r) => snapshot(r)) };
    },
  });

  const collection = (name: string) => ({
    ...query(name, []),
    doc: (id: string) => ({
      get: async () => snapshot(coll(name).get(id)),
      set: async (value: Row) => {
        coll(name).set(id, structuredClone(value));
      },
      create: async (value: Row) => {
        if (coll(name).has(id)) throw Object.assign(new Error('already exists'), { code: 6 });
        coll(name).set(id, structuredClone(value));
      },
      delete: async () => {
        coll(name).delete(id);
      },
    }),
  });

  let transactionQueue = Promise.resolve();
  async function runTransaction<T>(callback: (tx: { get: (ref: { get: () => Promise<unknown> }) => Promise<unknown>; set: (ref: { set: (value: Row) => Promise<void> }, value: Row) => void }) => Promise<T>): Promise<T> {
    const previous = transactionQueue;
    let release!: () => void;
    transactionQueue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    const writes: (() => Promise<void>)[] = [];
    try {
      const result = await callback({ get: (ref) => ref.get(), set: (ref, value) => { writes.push(() => ref.set(value)); } });
      for (const write of writes) await write();
      return result;
    } finally { release(); }
  }
  return { collection, runTransaction } as unknown as Firestore;
}
