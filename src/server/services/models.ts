import type { GenAiClient } from './ai';

/** The part of the SDK client that lists models. Tests pass a fake. */
export type ModelsClient = Pick<GenAiClient, 'models'>;

/** Raised when a call does not settle in time. Retryable: the next model may answer. */
export class TimeoutError extends Error {
  constructor() {
    super('AI request timed out');
    this.name = 'TimeoutError';
  }
}

/** Rejects with TimeoutError if the promise does not settle within `ms`. */
export async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError()), ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Upper bound for listing models. Listing is a side task and must not eat the triage budget. */
const LIST_TIMEOUT_MS = 4_000;

/** Model listing per client, so a process asks the API once. Keyed by object so tests can use fresh clients. */
const listCache = new WeakMap<object, Promise<string[]>>();

/**
 * Model ids the key can use for generateContent, without the 'models/' prefix. Models that
 * list supportedActions without generateContent are dropped. A failed listing resolves to []
 * and is not cached, so the next call tries again.
 */
export function listModelNames(client: ModelsClient): Promise<string[]> {
  const cached = listCache.get(client);
  if (cached) return cached;

  const pending = withTimeout(collectNames(client), LIST_TIMEOUT_MS).catch((err: unknown) => {
    listCache.delete(client);
    console.warn('Gemini model listing failed:', err instanceof Error ? err.name : 'unknown error');
    return [] as string[];
  });
  listCache.set(client, pending);
  return pending;
}

async function collectNames(client: ModelsClient): Promise<string[]> {
  const pager = await client.models.list();
  const names: string[] = [];
  for await (const model of pager) {
    if (model.supportedActions && !model.supportedActions.includes('generateContent')) continue;
    const name = model.name?.replace(/^models\//, '');
    if (name) names.push(name);
  }
  return names;
}

const EXCLUDED = /tts|image|live|embedding|audio/i;

/** Numeric version parts of a model id, e.g. 'gemini-3.8-flash' -> [3, 8]. Empty when none. */
function versionOf(name: string): number[] {
  const match = /\d+(?:\.\d+)*/.exec(name);
  return match ? match[0].split('.').map(Number) : [];
}

/** Newer versions first. Missing parts count as 0, so [3] and [3, 0] are equal. */
export function newestFirst(a: string, b: string): number {
  const va = versionOf(a);
  const vb = versionOf(b);
  for (let i = 0; i < Math.max(va.length, vb.length); i++) {
    const diff = (vb[i] ?? 0) - (va[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Text models to try, in order: the configured one, then up to two other flash models (not TTS,
 * image, live or embedding), lite models first, then the newest version. De-duplicated.
 */
export function textModelCandidates(configured: string, names: string[]): string[] {
  const others = names
    .filter((n) => n !== configured && /flash/i.test(n) && !EXCLUDED.test(n))
    .sort((a, b) => {
      const lite = Number(/lite/i.test(b)) - Number(/lite/i.test(a));
      return lite !== 0 ? lite : newestFirst(a, b);
    });
  return [...new Set([configured, ...others.slice(0, 2)])];
}
