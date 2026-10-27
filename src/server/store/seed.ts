import type {
  FeedbackRatings,
  FeedbackResponse,
  Language,
  PassportEntry,
  Report,
  ReportStatus,
  ReportUpdate,
  Role,
  Severity,
  Shift,
  Site,
  Worker,
} from '../../shared/types';
import { addDays, istDay, istMidnightMs } from '../domain/time';
import type { Repo } from './repo';

export interface SeedOptions {
  /** Anonymous feedback responses per site (default 7; the admin view needs at least 5). */
  feedbackPerSite?: number;
}

type Profile = 'regular' | 'fatigue' | 'newJoiner' | 'night' | 'admin';

interface WorkerSeed {
  id: string;
  name: string;
  siteId: string;
  role: Role;
  language: Language;
  jobTitle: string;
  joinedOn: string;
  profile: Profile;
  advanceThisPeriod?: number;
}

const SITES: Site[] = [
  {
    id: 'site-skyline',
    name: 'Skyline Towers, Chennai',
    industry: 'construction',
    lat: 13.0827,
    lng: 80.2707,
    radiusM: 300,
  },
  {
    id: 'site-greenfield',
    name: 'Greenfield College Campus',
    industry: 'college',
    lat: 12.8231,
    lng: 80.0442,
    radiusM: 500,
  },
];

const WORKERS: WorkerSeed[] = [
  { id: 'worker-skyline-1', name: 'Ravi Kumar', siteId: 'site-skyline', role: 'worker', language: 'en', jobTitle: 'Mason', joinedOn: '2024-03-01', profile: 'regular' },
  { id: 'worker-skyline-2', name: 'Murugan Selvam', siteId: 'site-skyline', role: 'worker', language: 'ta', jobTitle: 'Electrician', joinedOn: '2024-05-12', profile: 'fatigue' },
  { id: 'worker-skyline-3', name: 'Sunita Devi', siteId: 'site-skyline', role: 'worker', language: 'hi', jobTitle: 'Helper', joinedOn: '2024-08-20', profile: 'regular' },
  { id: 'worker-skyline-4', name: 'Arjun Ravi', siteId: 'site-skyline', role: 'worker', language: 'ta', jobTitle: 'Scaffolder', joinedOn: '2023-11-02', profile: 'night' },
  { id: 'worker-skyline-5', name: 'Imran Ali', siteId: 'site-skyline', role: 'worker', language: 'hi', jobTitle: 'Carpenter', joinedOn: '2024-01-15', profile: 'regular', advanceThisPeriod: 50_000 },
  { id: 'admin-skyline', name: 'Priya Raman', siteId: 'site-skyline', role: 'admin', language: 'en', jobTitle: 'Site Supervisor', joinedOn: '2022-06-01', profile: 'admin' },
  { id: 'worker-greenfield-1', name: 'Lakshmi Iyer', siteId: 'site-greenfield', role: 'worker', language: 'en', jobTitle: 'Lab Assistant', joinedOn: '2023-07-10', profile: 'regular' },
  { id: 'worker-greenfield-2', name: 'Vikram Singh', siteId: 'site-greenfield', role: 'worker', language: 'hi', jobTitle: 'Security Guard', joinedOn: '2024-02-05', profile: 'regular' },
  { id: 'worker-greenfield-3', name: 'Kavitha Nair', siteId: 'site-greenfield', role: 'worker', language: 'ta', jobTitle: 'Library Assistant', joinedOn: '2023-09-18', profile: 'regular' },
  { id: 'worker-greenfield-4', name: 'Deepak Yadav', siteId: 'site-greenfield', role: 'worker', language: 'hi', jobTitle: 'Electrician', joinedOn: '2024-04-22', profile: 'regular' },
  { id: 'worker-greenfield-5', name: 'Meena Pillai', siteId: 'site-greenfield', role: 'worker', language: 'ta', jobTitle: 'Housekeeping', joinedOn: '', profile: 'newJoiner' },
  { id: 'admin-greenfield', name: 'Anand Krishnan', siteId: 'site-greenfield', role: 'admin', language: 'en', jobTitle: 'Facilities Manager', joinedOn: '2021-04-01', profile: 'admin' },
];

interface ReportSeed {
  siteId: string;
  language: Language;
  category: string;
  severity: Severity;
  status: ReportStatus;
  daysAgo: number;
  text: string;
  textEn: string;
  updates?: Array<{ status: ReportStatus; note?: string; daysAgo: number }>;
}

const REPORTS: ReportSeed[] = [
  {
    siteId: 'site-skyline', language: 'en', category: 'fall_height', severity: 'critical', status: 'in_progress', daysAgo: 2,
    text: 'A colleague nearly fell from the unguarded edge on the fourth floor. There is no railing there.',
    textEn: 'A colleague nearly fell from the unguarded edge on the fourth floor. There is no railing there.',
    updates: [
      { status: 'acknowledged', daysAgo: 2 },
      { status: 'in_progress', note: 'Railing being installed', daysAgo: 1 },
    ],
  },
  {
    siteId: 'site-skyline', language: 'hi', category: 'ppe_missing', severity: 'high', status: 'open', daysAgo: 6,
    text: 'चौथी मंजिल पर काम करने वाले मज़दूरों के पास सेफ्टी हेलमेट नहीं हैं।',
    textEn: 'Workers on the fourth floor do not have safety helmets.',
  },
  {
    siteId: 'site-skyline', language: 'ta', category: 'wage_issue', severity: 'medium', status: 'acknowledged', daysAgo: 10,
    text: 'இந்த மாத ஊதியம் மூன்று நாட்கள் தாமதமாக வழங்கப்பட்டது.',
    textEn: "This month's wages were paid three days late.",
    updates: [{ status: 'acknowledged', daysAgo: 9 }],
  },
  {
    siteId: 'site-skyline', language: 'en', category: 'heat_stress', severity: 'high', status: 'resolved', daysAgo: 15,
    text: 'Drinking water supply stopped for two hours in the afternoon heat.',
    textEn: 'Drinking water supply stopped for two hours in the afternoon heat.',
    updates: [
      { status: 'acknowledged', daysAgo: 14 },
      { status: 'resolved', note: 'Water tanker added to the site', daysAgo: 12 },
    ],
  },
  {
    siteId: 'site-skyline', language: 'hi', category: 'harassment', severity: 'high', status: 'open', daysAgo: 1,
    text: 'सुपरवाइज़र बिना वजह मज़दूरों को गाली देते हैं।',
    textEn: 'The supervisor abuses workers without any reason.',
  },
  {
    siteId: 'site-skyline', language: 'en', category: 'other', severity: 'low', status: 'open', daysAgo: 3,
    text: 'Could you add a shade tent near the mixer machine? It would be better for breaks.',
    textEn: 'Could you add a shade tent near the mixer machine? It would be better for breaks.',
  },
  {
    siteId: 'site-greenfield', language: 'en', category: 'electrical', severity: 'high', status: 'in_progress', daysAgo: 4,
    text: 'Sparks came from a socket in Lab 2 after a heater was plugged in.',
    textEn: 'Sparks came from a socket in Lab 2 after a heater was plugged in.',
    updates: [{ status: 'in_progress', note: 'Electrician called', daysAgo: 3 }],
  },
  {
    siteId: 'site-greenfield', language: 'ta', category: 'slippery_floor', severity: 'medium', status: 'open', daysAgo: 2,
    text: 'கேன்டீன் வாசலில் தண்ணீர் தேங்கி தரை வழுக்குகிறது.',
    textEn: 'Water pools at the canteen entrance and the floor is slippery.',
  },
  {
    siteId: 'site-greenfield', language: 'hi', category: 'workload', severity: 'medium', status: 'acknowledged', daysAgo: 9,
    text: 'हमारे विभाग में स्टाफ़ की कमी है, रोज़ दो घंटे ज़्यादा काम करना पड़ता है।',
    textEn: 'Our department is short-staffed, so we work two extra hours every day.',
    updates: [{ status: 'acknowledged', daysAgo: 8 }],
  },
  {
    siteId: 'site-greenfield', language: 'en', category: 'fire_safety', severity: 'critical', status: 'resolved', daysAgo: 20,
    text: 'The fire extinguisher in block C had expired. It was replaced after the report.',
    textEn: 'The fire extinguisher in block C had expired. It was replaced after the report.',
    updates: [{ status: 'resolved', note: 'Extinguisher replaced and checked', daysAgo: 18 }],
  },
  {
    siteId: 'site-greenfield', language: 'ta', category: 'wage_issue', severity: 'medium', status: 'open', daysAgo: 5,
    text: 'ஒரு மாதத்துக்கான முன்பணம் சம்பளத்தில் பிடிக்கப்பட்டது, ஏன் என்று விளக்கம் இல்லை.',
    textEn: 'An advance was deducted from my salary without any explanation.',
  },
  {
    siteId: 'site-greenfield', language: 'en', category: 'other', severity: 'low', status: 'open', daysAgo: 12,
    text: 'It would be better to have a water cooler on every floor of the library block.',
    textEn: 'It would be better to have a water cooler on every floor of the library block.',
  },
];

const FEEDBACK_COMMENTS = [
  'Supervisors listen when we raise safety concerns.',
  'Wages have been paid on time this month.',
  'Water breaks should be longer in the summer.',
  'The rest room is far from the work area.',
  'Respect at work has clearly improved this year.',
  'Too many extra hours during exam weeks.',
  'Safety shoes are given out promptly now.',
];

const CONSTRUCTION_PASSPORT = [
  'Working at Heights',
  'Basic First Aid',
  'Scaffolding Safety',
  'Electrical Safety Basics',
  'Site Safety Induction',
  'Masonry Skills',
];
const COLLEGE_PASSPORT = [
  'First Aid for Campus Staff',
  'Chemical Handling Basics',
  'Fire Safety Drill',
  'Customer Service Training',
  'Electrical Safety for Staff',
];

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

function shiftsFor(worker: WorkerSeed, site: Site, today: string, rand: () => number): Shift[] {
  const out: Shift[] = [];
  for (let k = 21; k >= 1; k--) {
    const day = addDays(today, -k);
    if (worker.profile === 'admin' || day < worker.joinedOn) continue;

    const streak = worker.profile === 'fatigue' && k <= 8;
    // The fatigue demo worker takes two unplanned days off before the streak, which keeps
    // the absence factor in quit risk realistic.
    if (worker.profile === 'fatigue' && (k === 10 || k === 12)) continue;
    if (!streak) {
      if (weekday(day) === 0) continue;
      const attendance = worker.profile === 'newJoiner' ? 0.5 : 0.92;
      if (rand() > attendance) continue;
    }

    let startMinutes: number;
    let hours: number;
    if (streak) {
      startMinutes = 6 * 60;
      hours = 13;
    } else if (worker.profile === 'night') {
      startMinutes = 21 * 60 + 30;
      hours = 8 + rand() * 1.5;
    } else {
      startMinutes = 8 * 60 + Math.round(rand() * 90);
      hours = 7.5 + rand() * 1.5;
      if (rand() < 0.25) hours += 1 + Math.round(rand() * 2);
    }

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
  const rand = prng(`fairshift-demo-${today}`);

  for (const site of SITES) await repo.saveSite(site);

  const siteById = new Map(SITES.map((s) => [s.id, s]));
  for (const seed of WORKERS) {
    const site = siteById.get(seed.siteId);
    if (!site) continue;
    const joinedOn = seed.profile === 'newJoiner' ? addDays(today, -40) : seed.joinedOn;
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

    for (const shift of shiftsFor({ ...seed, joinedOn }, site, today, rand)) {
      await repo.saveShift(shift);
    }

    // Colleagues already on site today, so the admin dashboard is live. The demo personas
    // (each site's first worker) are left checked out so judges can try checking in.
    const checkIn = istMidnightMs(today) + 8 * 60 * 60_000;
    const isPersona = seed.id.endsWith('-1');
    if (seed.role === 'worker' && seed.profile === 'regular' && !isPersona && now.getTime() > checkIn) {
      await repo.saveShift({
        id: `shift-${seed.id}-0`,
        workerId: seed.id,
        siteId: seed.siteId,
        checkIn: new Date(checkIn).toISOString(),
        checkOut: null,
        method: 'qr',
      });
    }

    if (seed.role === 'worker') {
      const titles = site.industry === 'construction' ? CONSTRUCTION_PASSPORT : COLLEGE_PASSPORT;
      const count = 2 + Math.floor(rand() * 3);
      for (let i = 0; i < count; i++) {
        const entry: PassportEntry = {
          // Opaque id: passport ids are shown on public share tokens, so they must not embed the worker id.
          id: `pp-${hashSeed(`${seed.id}:${i}`).toString(36)}`,
          workerId: seed.id,
          kind: i === 0 ? 'experience' : pickOne(['training', 'certification'] as const, rand),
          title: pickOne(titles, rand),
          issuer: 'Demo Skills Council',
          issuedOn: addDays(today, -(30 + i * 60 + Math.floor(rand() * 20))),
          industry: site.industry,
        };
        if (entry.kind !== 'experience') entry.hours = 8 + Math.floor(rand() * 4) * 4;
        await repo.savePassport(entry);
      }
    }
  }

  const codes = new Set<string>();
  for (const seed of REPORTS) {
    const caseCode = uniqueCode(rand, codes);
    const updates: ReportUpdate[] = (seed.updates ?? []).map((u) => {
      const update: ReportUpdate = { status: u.status, day: addDays(today, -u.daysAgo) };
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
      createdDay: addDays(today, -seed.daysAgo),
      updates,
    };
    await repo.saveReport(report);
  }

  for (const site of SITES) {
    for (const response of feedbackFor(site.id, feedbackPerSite, month, rand)) {
      await repo.saveFeedback(response);
    }
  }
}

function uniqueCode(rand: () => number, taken: Set<string>): string {
  for (;;) {
    let raw = '';
    for (let i = 0; i < 8; i++) raw += pickOne([...CASE_ALPHABET], rand);
    const code = `${raw.slice(0, 4)}-${raw.slice(4)}`;
    if (!taken.has(code)) {
      taken.add(code);
      return code;
    }
  }
}
