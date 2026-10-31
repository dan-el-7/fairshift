export type Industry = 'construction' | 'college';
export type Language = 'en' | 'hi' | 'ta';
export type Role = 'worker' | 'admin';
export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type ReportStatus = 'open' | 'acknowledged' | 'in_progress' | 'resolved';
export type RiskLevel = 'low' | 'medium' | 'high';

export interface IndustryConfig {
  id: Industry;
  payModel: 'daily' | 'monthly';
  /** paise per day, daily pay model only */
  dailyWage?: number;
  /** paise per month, monthly pay model only */
  monthlySalary?: number;
  workingDaysPerMonth?: number;
  regularHoursPerDay: number;
  overtimeMultiplier: number;
  /** paise per night hour (22:00–06:00 IST) */
  nightAllowancePerHour: number;
  halfDayThresholdHours: number;
  hazardCategories: string[];
  checkInModes: ('qr' | 'geo')[];
}

export interface Site {
  id: string;
  name: string;
  industry: Industry;
  lat: number;
  lng: number;
  radiusM: number;
}

export interface Worker {
  id: string;
  name: string;
  siteId: string;
  role: Role;
  language: Language;
  jobTitle: string;
  joinedOn: string; // YYYY-MM-DD
  /** paise deducted this period for salary advances */
  advanceThisPeriod?: number;
}

export interface Shift {
  id: string;
  workerId: string;
  siteId: string;
  checkIn: string; // ISO
  checkOut: string | null;
  method: 'qr' | 'geo' | 'correction';
}

export interface ShiftSummary {
  hours: number;
  regularHours: number;
  overtimeHours: number;
  nightHours: number;
}

export interface ShiftWithSummary extends Shift {
  summary: ShiftSummary;
}

export interface PeriodSummary extends ShiftSummary {
  daysWorked: number;
}

export interface PayPeriod {
  /** YYYY-MM */
  id: string;
  start: string; // ISO, inclusive
  end: string; // ISO, exclusive
  workingDays: number;
}

export interface PayLine {
  key: 'pay.base' | 'pay.overtime' | 'pay.night' | 'pay.pf' | 'pay.esi' | 'pay.advance';
  /** paise; deductions are positive numbers, `kind` says which side */
  amount: number;
  kind: 'earning' | 'deduction';
  params: Record<string, number>;
}

export interface Payslip {
  workerId: string;
  period: PayPeriod;
  industry: Industry;
  lines: PayLine[];
  gross: number;
  deductions: number;
  net: number;
  summary: PeriodSummary;
  adjustments?: { day: string; amount: number; reason: string }[];
}

export interface CorrectionRequest {
  id: string;
  day: string;
  kind: 'shift' | 'pay';
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  /** Last approved change when submitted. A stale proposal must be resubmitted. */
  basedOn: string;
  shiftId?: string;
  checkIn?: string;
  checkOut?: string;
  originalShift?: Shift;
  amount?: number;
  reviewedAt?: string;
  reviewer?: string;
  reviewReason?: string;
}

/** Per-worker history; updated atomically so concurrent reviews cannot lose or double-apply changes. */
export interface CorrectionLedger {
  workerId: string;
  siteId: string;
  version: number;
  requests: CorrectionRequest[];
}

/** A site-wide schedule notice. It never changes attendance or payroll. */
export interface DayOff {
  siteId: string;
  day: string;
  label: string;
  active: boolean;
}

export interface DailyPay {
  day: string;
  summary: PeriodSummary;
  open: boolean;
  dayOff?: string;
  base: number;
  overtime: number;
  night: number;
  gross: number;
  pf: number;
  esi: number;
  net: number;
  adjustment?: number;
}

export interface PayCalendar {
  month: string;
  today: string;
  days: DailyPay[];
  /** Net difference between daily estimates and the monthly payslip, including advances. */
  monthlyAdjustment: number;
}

export type FatigueRule = 'long_shift' | 'short_rest' | 'no_rest_day' | 'weekly_overload';

export interface FatigueFlag {
  rule: FatigueRule;
  severity: 'medium' | 'high';
  detail: Record<string, number | string>;
  at: string; // ISO
}

export interface QuitRiskFactor {
  factor: 'high_overtime' | 'fatigue' | 'absences' | 'new_joiner' | 'declining_attendance';
  points: number;
}

export interface QuitRisk {
  score: number;
  level: RiskLevel;
  factors: QuitRiskFactor[];
}

export interface ReportUpdate {
  status: ReportStatus;
  note?: string;
  day: string; // YYYY-MM-DD
  fixResponse?: 'confirmed' | 'disputed';
  actor?: 'admin' | 'reporter';
}

/** Stored report. Deliberately has no worker id, time-of-day or IP. */
export interface Report {
  id: string;
  caseCode: string;
  siteId: string;
  category: string;
  severity: Severity;
  language: Language;
  /** redacted text in the reporter's language */
  text: string;
  /** redacted English translation (same as text when language is en or AI unavailable) */
  textEn: string;
  status: ReportStatus;
  version?: number;
  fixResponse?: 'confirmed' | 'disputed';
  reporterSecretHash?: string;
  createdDay: string; // YYYY-MM-DD
  updates: ReportUpdate[];
}

export interface FeedbackRatings {
  safety: number;
  fairness: number;
  respect: number;
  workload: number;
}

/** Stored anonymous feedback. No worker id. */
export interface FeedbackResponse {
  id: string;
  siteId: string;
  month: string; // YYYY-MM
  ratings: FeedbackRatings;
  comment?: string;
}

export interface FeedbackAggregate {
  count: number;
  averages: FeedbackRatings;
  comments: string[];
}

export type PassportKind = 'training' | 'certification' | 'experience';

export interface PassportEntry {
  id: string;
  workerId: string;
  kind: PassportKind;
  title: string;
  issuer: string;
  issuedOn: string; // YYYY-MM-DD
  hours?: number;
  industry: Industry;
}

export interface PassportPayload {
  workerName: string;
  entries: Omit<PassportEntry, 'workerId'>[];
  issuedAt: string; // ISO
}
