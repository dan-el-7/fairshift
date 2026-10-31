import type {
  FeedbackRatings,
  FeedbackResponse,
  PassportEntry,
  Report,
  ReportUpdate,
  Shift,
  Site,
  Worker,
} from '../../shared/types';
import { addDays, istDay, istMidnightMs } from '../domain/time';
import type { Repo } from './repo';
import {
  COLLEGE_PASSPORT,
  CONSTRUCTION_PASSPORT,
  FEEDBACK_COMMENTS,
  REPORTS,
  SITES,
  WORKERS,
  type Profile,
  type WorkerSeed,
} from './seed-data';

export interface SeedOptions {
  /** Anonymous feedback responses per site (default 7; the admin view needs at least 5). */
  feedbackPerSite?: number;
}

interface SeedContext {
  now: Date;
  today: string;
  rand: () => number;
}

const CASE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** FNV-1a hash of a string, used to seed the PRNG. */
function hashSeed(text: string): number {
  let h = 2_166_136_261;
  for (const ch of text) {
    h ^= ch.codePointAt(0) ?? 0;
    h = Math.imul(h, 16_777_619);
  }
  return h >>> 0;
}

/** Small deterministic PRNG (mulberry32). Returns floats in [0, 1). */
function prng(seed: string): () => number {
  let a = hashSeed(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function pickOne<T>(items: readonly T[], rand: () => number): T {
  const item = items[Math.floor(rand() * items.length)];
  if (item === undefined) throw new Error('cannot pick from an empty list');
  return item;
}

/** Day of week for a YYYY-MM-DD calendar day (0 = Sunday). */
function weekday(day: string): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

/** ISO instant of a wall-clock time on an IST calendar day. */
function atIst(day: string, minutesIntoDay: number): string {
  return new Date(istMidnightMs(day) + minutesIntoDay * 60_000).toISOString();
}

/** True when the worker has no shift on this day: a planned day off, a Sunday or an unplanned absence. */
function skipsDay(worker: WorkerSeed, day: string, k: number, streak: boolean, rand: () => number): boolean {
  // The fatigue demo worker takes two unplanned days off before the streak, which keeps
  // the absence factor in quit risk realistic.
  if (worker.profile === 'fatigue' && (k === 10 || k === 12)) return true;
  if (streak) return false;
  if (weekday(day) === 0) return true;
  const attendance = worker.profile === 'newJoiner' ? 0.5 : 0.92;
  return rand() > attendance;
}

/** Start (minutes after IST midnight) and length in hours of one shift. Draws random numbers in a fixed order. */
function workWindow(profile: Profile, streak: boolean, rand: () => number): { startMinutes: number; hours: number } {
  if (streak) return { startMinutes: 6 * 60, hours: 13 };
  if (profile === 'night') return { startMinutes: 21 * 60 + 30, hours: 8 + rand() * 1.5 };
  const startMinutes = 8 * 60 + Math.round(rand() * 90);
  let hours = 7.5 + rand() * 1.5;
  if (rand() < 0.25) hours += 1 + Math.round(rand() * 2);
  return { startMinutes, hours };
}

function shiftsFor(worker: WorkerSeed, site: Site, today: string, rand: () => number): Shift[] {
  const out: Shift[] = [];
  for (let k = 21; k >= 1; k--) {
    const day = addDays(today, -k);
    if (worker.profile === 'admin' || day < worker.joinedOn) continue;

    const streak = worker.profile === 'fatigue' && k <= 8;
    if (skipsDay(worker, day, k, streak, rand)) continue;

    const { startMinutes, hours } = workWindow(worker.profile, streak, rand);
    const checkIn = atIst(day, startMinutes);
    const checkOutMs = Date.parse(checkIn) + Math.round(hours * 4) * 15 * 60_000;
    out.push({
      id: `shift-${worker.id}-${k}`,
      workerId: worker.id,
      siteId: site.id,
      checkIn,
      checkOut: new Date(checkOutMs).toISOString(),
      method: rand() < 0.2 ? 'geo' : 'qr',
    });
  }
  return out;
}

function feedbackFor(siteId: string, count: number, month: string, rand: () => number): FeedbackResponse[] {
  const responses: FeedbackResponse[] = [];
  for (let i = 0; i < count; i++) {
    const score = (): number => Math.min(5, Math.max(1, 2 + Math.round(rand() * 3)));
    const ratings: FeedbackRatings = {
      safety: score(),
      fairness: score(),
      respect: score(),
      workload: score(),
    };
    const response: FeedbackResponse = { id: `fb-${siteId}-${i + 1}`, siteId, month, ratings };
    if (i % 2 === 0) response.comment = pickOne(FEEDBACK_COMMENTS, rand);
    responses.push(response);
  }
  return responses;
}

/**
 * Populates a repository with the FairShift demo organisation. Deterministic for a given `now`:
 * same date in, same data out. Uses no Math.random. Writes nothing secret.
 */
export async function seedDemo(repo: Repo, now: Date, options: SeedOptions = {}): Promise<void> {
  const today = istDay(now);
  const month = today.slice(0, 7);
  const feedbackPerSite = options.feedbackPerSite ?? 7;
  const ctx: SeedContext = { now, today, rand: prng(`fairshift-demo-${today}`) };

  for (const site of SITES) await repo.saveSite(site);

  const siteById = new Map(SITES.map((s) => [s.id, s]));
  for (const seed of WORKERS) {
    const site = siteById.get(seed.siteId);
    if (!site) continue;
    await seedWorker(repo, seed, site, ctx);
  }

  await seedReports(repo, ctx);

  for (const site of SITES) {
    for (const response of feedbackFor(site.id, feedbackPerSite, month, ctx.rand)) {
      await repo.saveFeedback(response);
    }
  }
}

/** Saves one demo worker with their shifts, today's check-in (if any) and passport entries. */
async function seedWorker(repo: Repo, seed: WorkerSeed, site: Site, ctx: SeedContext): Promise<void> {
  const joinedOn = seed.profile === 'newJoiner' ? addDays(ctx.today, -40) : seed.joinedOn;
  const worker: Worker = {
    id: seed.id,
    name: seed.name,
    siteId: seed.siteId,
    role: seed.role,
    language: seed.language,
    jobTitle: seed.jobTitle,
    joinedOn,
  };
  if (seed.advanceThisPeriod !== undefined) worker.advanceThisPeriod = seed.advanceThisPeriod;
  await repo.saveWorker(worker);

  for (const shift of shiftsFor({ ...seed, joinedOn }, site, ctx.today, ctx.rand)) {
    await repo.saveShift(shift);
  }
  await seedPreviousMonth(repo, { ...seed, joinedOn }, site, ctx.today);

  await seedCheckedIn(repo, seed, ctx);

  if (seed.role === 'worker') await seedPassport(repo, seed, site, ctx);
}

/** Separate deterministic history makes pay comparison usable without changing recent demo attendance. */
async function seedPreviousMonth(repo: Repo, seed: WorkerSeed, site: Site, today: string): Promise<void> {
  if (seed.role !== 'worker') return;
  const last = addDays(today.slice(0, 7) + '-01', -1);
  for (let day = last.slice(0, 7) + '-01'; day <= last; day = addDays(day, 1)) {
    if (day < seed.joinedOn || weekday(day) === 0) continue;
    const hours = weekday(day) === 5 ? 9 : 8;
    await repo.saveShift({
      id: `history-${seed.id}-${day}`, workerId: seed.id, siteId: site.id,
      checkIn: atIst(day, 9 * 60), checkOut: atIst(day, (9 + hours) * 60), method: 'qr',
    });
  }
}

/**
 * Colleagues already on site today, so the admin dashboard is live. The demo personas
 * (each site's first worker) are left checked out so judges can try checking in.
 */
async function seedCheckedIn(repo: Repo, seed: WorkerSeed, ctx: SeedContext): Promise<void> {
  const checkIn = istMidnightMs(ctx.today) + 8 * 60 * 60_000;
  const isPersona = seed.id.endsWith('-1');
  if (seed.role !== 'worker' || seed.profile !== 'regular' || isPersona || ctx.now.getTime() <= checkIn) return;
  await repo.saveShift({
    id: `shift-${seed.id}-0`,
    workerId: seed.id,
    siteId: seed.siteId,
    checkIn: new Date(checkIn).toISOString(),
    checkOut: null,
    method: 'qr',
  });
}

async function seedPassport(repo: Repo, seed: WorkerSeed, site: Site, ctx: SeedContext): Promise<void> {
  const titles = site.industry === 'construction' ? CONSTRUCTION_PASSPORT : COLLEGE_PASSPORT;
  const count = 2 + Math.floor(ctx.rand() * 3);
  for (let i = 0; i < count; i++) {
    const entry: PassportEntry = {
      // Opaque id: passport ids are shown on public share tokens, so they must not embed the worker id.
      id: `pp-${hashSeed(`${seed.id}:${i}`).toString(36)}`,
      workerId: seed.id,
      kind: i === 0 ? 'experience' : pickOne(['training', 'certification'] as const, ctx.rand),
      title: pickOne(titles, ctx.rand),
      issuer: 'Demo Skills Council',
      issuedOn: addDays(ctx.today, -(30 + i * 60 + Math.floor(ctx.rand() * 20))),
      industry: site.industry,
    };
    if (entry.kind !== 'experience') entry.hours = 8 + Math.floor(ctx.rand() * 4) * 4;
    await repo.savePassport(entry);
  }
}

async function seedReports(repo: Repo, ctx: SeedContext): Promise<void> {
  const codes = new Set<string>();
  for (const seed of REPORTS) {
    const caseCode = uniqueCode(ctx.rand, codes);
    const updates: ReportUpdate[] = (seed.updates ?? []).map((u) => {
      const update: ReportUpdate = { status: u.status, day: addDays(ctx.today, -u.daysAgo) };
      if (u.note !== undefined) update.note = u.note;
      return update;
    });
    const report: Report = {
      id: `rpt-${caseCode.replace('-', '').toLowerCase()}`,
      caseCode,
      siteId: seed.siteId,
      category: seed.category,
      severity: seed.severity,
      language: seed.language,
      text: seed.text,
      textEn: seed.textEn,
      status: seed.status,
      createdDay: addDays(ctx.today, -seed.daysAgo),
      updates,
    };
    await repo.saveReport(report);
  }
}

function uniqueCode(rand: () => number, taken: Set<string>): string {
  for (;;) {
    let raw = '';
    for (let i = 0; i < 8; i++) raw += pickOne(Array.from(CASE_ALPHABET), rand);
    const code = `${raw.slice(0, 4)}-${raw.slice(4)}`;
    if (!taken.has(code)) {
      taken.add(code);
      return code;
    }
  }
}
