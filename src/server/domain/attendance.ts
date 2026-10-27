import type { IndustryConfig, PeriodSummary, Shift, ShiftSummary, Site } from '../../shared/types';
import { hoursBetween, istDay, nightOverlapHours, toMs } from './time';

const EARTH_RADIUS_M = 6_371_000;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Great-circle distance in metres between two lat/lng points (haversine). */
export function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** True when the point lies within the site's geofence radius (inclusive). */
export function withinGeofence(site: Site, lat: number, lng: number): boolean {
  return haversineMetres(site.lat, site.lng, lat, lng) <= site.radiusM;
}

/** Splits a completed shift into regular, overtime and night hours. Open shifts yield zeros. */
export function summariseShift(shift: Shift, cfg: IndustryConfig): ShiftSummary {
  if (shift.checkOut === null) {
    return { hours: 0, regularHours: 0, overtimeHours: 0, nightHours: 0 };
  }
  const startMs = toMs(shift.checkIn);
  const endMs = toMs(shift.checkOut);
  const raw = Math.max(0, hoursBetween(startMs, endMs));
  return {
    hours: round2(raw),
    regularHours: round2(Math.min(raw, cfg.regularHoursPerDay)),
    overtimeHours: round2(Math.max(0, raw - cfg.regularHoursPerDay)),
    nightHours: round2(endMs > startMs ? nightOverlapHours(startMs, endMs) : 0),
  };
}

/**
 * Totals a set of shifts and counts worked days. Hours are summed per IST day:
 * a day with at least halfDayThresholdHours counts 1, a day with fewer (but > 0) counts 0.5.
 */
export function summarisePeriod(shifts: Shift[], cfg: IndustryConfig): PeriodSummary {
  const totals: ShiftSummary = { hours: 0, regularHours: 0, overtimeHours: 0, nightHours: 0 };
  const hoursByDay = new Map<string, number>();

  for (const shift of shifts) {
    const s = summariseShift(shift, cfg);
    totals.hours += s.hours;
    totals.regularHours += s.regularHours;
    totals.overtimeHours += s.overtimeHours;
    totals.nightHours += s.nightHours;
    const day = istDay(shift.checkIn);
    hoursByDay.set(day, (hoursByDay.get(day) ?? 0) + s.hours);
  }

  let daysWorked = 0;
  for (const hours of hoursByDay.values()) {
    if (hours >= cfg.halfDayThresholdHours) daysWorked += 1;
    else if (hours > 0) daysWorked += 0.5;
  }

  return {
    hours: round2(totals.hours),
    regularHours: round2(totals.regularHours),
    overtimeHours: round2(totals.overtimeHours),
    nightHours: round2(totals.nightHours),
    daysWorked,
  };
}
