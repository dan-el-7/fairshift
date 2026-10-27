import type { Industry, IndustryConfig } from './types';

/**
 * Each industry is pure configuration. Supporting a new sector (hospital, factory)
 * means adding one entry here; payroll, attendance and reporting code stays the same.
 */
export const INDUSTRIES: Record<Industry, IndustryConfig> = {
  construction: {
    id: 'construction',
    payModel: 'daily',
    dailyWage: 75_000,
    regularHoursPerDay: 8,
    overtimeMultiplier: 2,
    nightAllowancePerHour: 2_500,
    halfDayThresholdHours: 4,
    hazardCategories: [
      'fall_height',
      'scaffolding',
      'electrical',
      'heavy_machinery',
      'ppe_missing',
      'heat_stress',
      'harassment',
      'wage_issue',
      'other',
    ],
    checkInModes: ['qr', 'geo'],
  },
  college: {
    id: 'college',
    payModel: 'monthly',
    monthlySalary: 1_800_000,
    workingDaysPerMonth: 26,
    regularHoursPerDay: 8,
    overtimeMultiplier: 2,
    nightAllowancePerHour: 2_000,
    halfDayThresholdHours: 4,
    hazardCategories: [
      'electrical',
      'chemical_lab',
      'slippery_floor',
      'fire_safety',
      'workload',
      'harassment',
      'wage_issue',
      'other',
    ],
    checkInModes: ['qr', 'geo'],
  },
};
