import type { Severity } from './types';

export type HazardPatternKind = 'repeating' | 'persistent';

export interface HazardPattern {
  category: string;
  reportCount: number;
  unresolvedCount: number;
  firstDay: string;
  lastDay: string;
  highestSeverity: Severity;
  pattern: HazardPatternKind;
}

export interface HazardPatternsResponse {
  windowDays: number;
  patterns: HazardPattern[];
}
