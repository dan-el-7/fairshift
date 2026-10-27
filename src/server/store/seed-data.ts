import type { Language, ReportStatus, Role, Severity, Site } from '../../shared/types';

/** Demo organisation data. Used only by seedDemo in seed.ts. */
export type Profile = 'regular' | 'fatigue' | 'newJoiner' | 'night' | 'admin';

export interface WorkerSeed {
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

export const SITES: Site[] = [
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

export const WORKERS: WorkerSeed[] = [
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

export interface ReportSeed {
  siteId: string;
  language: Language;
  category: string;
  severity: Severity;
  status: ReportStatus;
  daysAgo: number;
  text: string;
  textEn: string;
  updates?: { status: ReportStatus; note?: string; daysAgo: number }[];
}

export const REPORTS: ReportSeed[] = [
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

export const FEEDBACK_COMMENTS = [
  'Supervisors listen when we raise safety concerns.',
  'Wages have been paid on time this month.',
  'Water breaks should be longer in the summer.',
  'The rest room is far from the work area.',
  'Respect at work has clearly improved this year.',
  'Too many extra hours during exam weeks.',
  'Safety shoes are given out promptly now.',
];

export const CONSTRUCTION_PASSPORT = [
  'Working at Heights',
  'Basic First Aid',
  'Scaffolding Safety',
  'Electrical Safety Basics',
  'Site Safety Induction',
  'Masonry Skills',
];
export const COLLEGE_PASSPORT = [
  'First Aid for Campus Staff',
  'Chemical Handling Basics',
  'Fire Safety Drill',
  'Customer Service Training',
  'Electrical Safety for Staff',
];
