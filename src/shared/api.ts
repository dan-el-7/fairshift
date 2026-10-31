import type {
  FatigueFlag,
  FeedbackAggregate,
  FeedbackRatings,
  Industry,
  Language,
  PassportEntry,
  PassportPayload,
  QuitRisk,
  Report,
  ReportStatus,
  Role,
  Severity,
  Shift,
  ShiftWithSummary,
  Site,
} from './types';

export interface Persona {
  id: string;
  name: string;
  role: Role;
  industry: Industry;
  siteName: string;
  language: Language;
}

export interface Me {
  id: string;
  name: string;
  role: Role;
  language: Language;
  jobTitle: string;
  site: Site;
}

export type CheckInRequest = { qrToken: string } | { lat: number; lng: number };

export interface AttendanceMe {
  open: Shift | null;
  recent: ShiftWithSummary[];
  fatigue: FatigueFlag[];
}

export interface CreateReportRequest {
  siteId: string;
  language: Language;
  text?: string;
  audioBase64?: string;
  audioMime?: string;
  category?: string;
}

export interface CreateReportResponse {
  caseCode: string;
  category: string;
  severity: Severity;
  reporterToken: string;
}

/** What anyone holding the case code may see. */
export type ReportPublic = Pick<
  Report,
  'caseCode' | 'category' | 'severity' | 'status' | 'createdDay' | 'updates'
>;

export interface ReportAdmin extends Omit<Report, 'reporterSecretHash'> {
  overdue: boolean;
}

export interface ReportTrackResponse extends ReportPublic {
  version: number;
  confirmationAvailable: boolean;
  fixResponse?: 'confirmed' | 'disputed';
}

export interface ReportResponseRequest {
  reporterToken: string;
  decision: 'confirmed' | 'disputed';
  expectedVersion: number;
  note?: string;
}

export interface FeedbackRequest {
  ratings: FeedbackRatings;
  comment?: string;
}

export type AdminFeedback = FeedbackAggregate | { insufficient: true; count: number };

export interface PassportMe {
  entries: PassportEntry[];
  shareToken: string;
}

export interface PassportVerify {
  valid: boolean;
  payload?: PassportPayload;
}

export interface WorkerSummary {
  id: string;
  name: string;
  jobTitle: string;
  language: Language;
  hours14d: number;
  overtime14d: number;
  fatigue: FatigueFlag[];
  quitRisk: QuitRisk;
}

export interface AdminOverview {
  site: Site;
  kpis: {
    workers: number;
    presentToday: number;
    overtimeHours14d: number;
    openReports: number;
    overdueReports: number;
    fatigueAlerts: number;
    highRiskWorkers: number;
  };
  /** one point per IST day, oldest first */
  attendance14d: { day: string; present: number; overtimeHours: number }[];
  reportsBySeverity: Record<Severity, number>;
  reportsByStatus: Record<ReportStatus, number>;
  atRisk: WorkerSummary[];
}

export interface QrResponse {
  token: string;
  expiresInSec: number;
}

export interface ApiError {
  error: string;
}
