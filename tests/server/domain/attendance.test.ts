import { describe, expect, it } from 'vitest';
import type { Shift, Site } from '../../../src/shared/types';
import { INDUSTRIES } from '../../../src/shared/industries';
import {
  haversineMetres,
  summariseShift,
  summarisePeriod,
  withinGeofence,
} from '../../../src/server/domain/attendance';

const cfg = INDUSTRIES.construction;

function shift(checkIn: string, checkOut: string | null, id = 's'): Shift {
  return { id, workerId: 'w1', siteId: 'site-skyline', checkIn, checkOut, method: 'qr' };
}

const skyline: Site = {
  id: 'site-skyline',
  name: 'Skyline Towers, Chennai',
  industry: 'construction',
  lat: 13.0827,
  lng: 80.2707,
  radiusM: 300,
};

describe('haversineMetres', () => {
  it('is zero for identical points', () => {
    expect(haversineMetres(13.0827, 80.2707, 13.0827, 80.2707)).toBe(0);
  });

  it('matches one degree of latitude: R * pi / 180 = 111194.93 m', () => {
    // R = 6371000 m; 6371000 * 3.14159265 / 180 = 111194.93
    expect(haversineMetres(0, 0, 1, 0)).toBeCloseTo(111194.93, 1);
  });
});

describe('withinGeofence', () => {
  it('accepts a point about 222 m north of the site (radius 300 m)', () => {
    // 0.002 deg lat * 111194.93 = 222.39 m
    expect(withinGeofence(skyline, 13.0847, 80.2707)).toBe(true);
  });

  it('rejects a point about 334 m north of the site', () => {
    // 0.003 deg lat * 111194.93 = 333.58 m > 300 m
    expect(withinGeofence(skyline, 13.0857, 80.2707)).toBe(false);
  });

  it('is inclusive at the radius boundary', () => {
    const site: Site = { ...skyline, lat: 0, lng: 0, radiusM: 111194.93 };
    expect(withinGeofence(site, 1, 0)).toBe(true);
    expect(withinGeofence({ ...site, radiusM: 111000 }, 1, 0)).toBe(false);
  });
});

describe('summariseShift', () => {
  it('splits an 11 h day shift: regular 8, overtime 3, no night', () => {
    // 08:00 -> 19:00 IST: hours 11; regular min(11,8)=8; overtime 11-8=3; night 0
    expect(
      summariseShift(
        shift('2024-01-10T08:00:00+05:30', '2024-01-10T19:00:00+05:30'),
        cfg,
      ),
    ).toEqual({ hours: 11, regularHours: 8, overtimeHours: 3, nightHours: 0 });
  });

  it('returns zeros for an open shift (no checkOut)', () => {
    expect(summariseShift(shift('2024-01-10T08:00:00+05:30', null), cfg)).toEqual({
      hours: 0,
      regularHours: 0,
      overtimeHours: 0,
      nightHours: 0,
    });
  });

  it('a full night shift 23:00 -> 07:00: hours 8, regular 8, overtime 0, night 7', () => {
    expect(
      summariseShift(
        shift('2024-01-10T23:00:00+05:30', '2024-01-11T07:00:00+05:30'),
        cfg,
      ),
    ).toEqual({ hours: 8, regularHours: 8, overtimeHours: 0, nightHours: 7 });
  });

  it('a 3.5 h short shift has no overtime or night hours', () => {
    expect(
      summariseShift(
        shift('2024-01-10T09:00:00+05:30', '2024-01-10T12:30:00+05:30'),
        cfg,
      ),
    ).toEqual({ hours: 3.5, regularHours: 3.5, overtimeHours: 0, nightHours: 0 });
  });

  it('rounds hours to 2 dp: 20 minutes = 0.3333 h -> 0.33', () => {
    const s = summariseShift(
      shift('2024-01-10T09:00:00+05:30', '2024-01-10T09:20:00+05:30'),
      cfg,
    );
    expect(s.hours).toBe(0.33);
    expect(s.regularHours).toBe(0.33);
  });
});

describe('summarisePeriod', () => {
  it('returns zeros and no days for no shifts', () => {
    expect(summarisePeriod([], cfg)).toEqual({
      hours: 0,
      regularHours: 0,
      overtimeHours: 0,
      nightHours: 0,
      daysWorked: 0,
    });
  });

  it('counts half-days, full days and ignores open shifts', () => {
    const shifts: Shift[] = [
      // Jan 10: 9 h -> full day (1); overtime 1
      shift('2024-01-10T08:00:00+05:30', '2024-01-10T17:00:00+05:30', 'a'),
      // Jan 11: 3 h -> half day (0.5)
      shift('2024-01-11T09:00:00+05:30', '2024-01-11T12:00:00+05:30', 'b'),
      // Jan 12: open shift -> 0 hours, not counted as a day
      shift('2024-01-12T08:00:00+05:30', null, 'c'),
      // Jan 13: two shifts 2 h + 2.5 h = 4.5 h -> full day (1), regular 4.5
      shift('2024-01-13T08:00:00+05:30', '2024-01-13T10:00:00+05:30', 'd'),
      shift('2024-01-13T14:00:00+05:30', '2024-01-13T16:30:00+05:30', 'e'),
    ];
    // hours 9 + 3 + 0 + 4.5 = 16.5; regular 8 + 3 + 0 + 4.5 = 15.5; overtime 1; daysWorked 1 + 0.5 + 1 = 2.5
    expect(summarisePeriod(shifts, cfg)).toEqual({
      hours: 16.5,
      regularHours: 15.5,
      overtimeHours: 1,
      nightHours: 0,
      daysWorked: 2.5,
    });
  });

  it('treats exactly the half-day threshold (4 h) as a full day', () => {
    const shifts = [shift('2024-01-10T08:00:00+05:30', '2024-01-10T12:00:00+05:30')];
    expect(summarisePeriod(shifts, cfg).daysWorked).toBe(1);
  });

  it('groups by IST day, so a night shift counts on its start day', () => {
    const shifts = [shift('2024-01-10T23:00:00+05:30', '2024-01-11T07:00:00+05:30')];
    expect(summarisePeriod(shifts, cfg).daysWorked).toBe(1);
  });
});
