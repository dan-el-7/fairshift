import { describe, expect, it } from 'vitest';
import type { Report } from '../../../src/shared/types';
import { summarizeHazardPatterns } from '../../../src/server/domain/hazardPatterns';

function report(id: string, createdDay: string, category = 'electrical', severity: Report['severity'] = 'medium'): Report {
  return {
    id, caseCode: `CODE-${id}`, siteId: 'site-a', category, severity, language: 'en', text: 'private text',
    textEn: 'private text', status: id.endsWith('r') ? 'resolved' : 'open', createdDay, updates: [],
  };
}

describe('summarizeHazardPatterns', () => {
  it('includes only groups with at least three reports across at least two days', () => {
    const result = summarizeHazardPatterns([
      report('a', '2026-10-27'), report('b', '2026-10-27'), report('c', '2026-10-26'),
      report('d', '2026-10-27', 'sparse'), report('e', '2026-10-27', 'sparse'), report('f', '2026-10-27', 'sparse'),
    ], new Date('2026-10-27T10:00:00Z'));
    expect(result.windowDays).toBe(30);
    expect(result.patterns).toEqual([expect.objectContaining({
      category: 'electrical', reportCount: 3, unresolvedCount: 3, firstDay: '2026-10-26',
      lastDay: '2026-10-27', highestSeverity: 'medium', pattern: 'repeating',
    })]);
  });

  it('ignores future and invalid dates and excludes days outside the 30-day window', () => {
    const result = summarizeHazardPatterns([
      report('a', '2026-09-27'), report('b', '2026-10-27'), report('c', '2026-10-26'),
      report('d', '2026-10-28'), report('e', '2026-02-30'),
    ], new Date('2026-10-27T10:00:00Z'));
    expect(result.patterns).toEqual([]);
  });

  it('counts days and picks the highest severity deterministically', () => {
    const result = summarizeHazardPatterns([
      report('a', '2026-10-25', 'fall_height', 'low'),
      report('b', '2026-10-26', 'fall_height', 'critical'),
      report('c', '2026-10-27', 'fall_height', 'high'),
    ], new Date('2026-10-27T10:00:00Z'));
    expect(result.patterns[0]).toMatchObject({ highestSeverity: 'critical', pattern: 'repeating' });
    expect(JSON.stringify(result)).not.toContain('private text');
  });

  it('marks a category persistent only when an unresolved report is at least seven days old', () => {
    const result = summarizeHazardPatterns([
      report('stale-open', '2026-10-20', 'stale'),
      report('stale-recent-1', '2026-10-26', 'stale'),
      report('stale-recent-2', '2026-10-27', 'stale'),
      report('resolved-oldr', '2026-10-20', 'resolved-old'),
      report('resolved-recent-1', '2026-10-26', 'resolved-old'),
      report('resolved-recent-2', '2026-10-27', 'resolved-old'),
    ], new Date('2026-10-27T10:00:00Z'));
    expect(result.patterns).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'stale', pattern: 'persistent' }),
      expect.objectContaining({ category: 'resolved-old', pattern: 'repeating' }),
    ]));
  });
});
