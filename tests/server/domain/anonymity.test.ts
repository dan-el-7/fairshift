import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { FeedbackResponse } from '../../../src/shared/types';
import {
  aggregateFeedback,
  caseCode,
  dayBucket,
  feedbackDedupeKey,
  redactPII,
} from '../../../src/server/domain/anonymity';

describe('caseCode', () => {
  it('is formatted XXXX-XXXX using only the unambiguous alphabet', () => {
    for (let i = 0; i < 200; i++) {
      expect(caseCode()).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/);
    }
  });

  it('never contains the confusable characters 0, 1, I, L, O', () => {
    const joined = Array.from({ length: 200 }, () => caseCode()).join('');
    expect(joined).not.toMatch(/[01ILO]/);
  });

  it('produces different codes across calls', () => {
    const codes = new Set(Array.from({ length: 50 }, () => caseCode()));
    expect(codes.size).toBeGreaterThan(45);
  });
});

describe('dayBucket', () => {
  it('returns the IST day, not the UTC day', () => {
    // 2024-01-10T19:00Z = 2024-01-11 00:30 IST
    expect(dayBucket(new Date('2024-01-10T19:00:00Z'))).toBe('2024-01-11');
  });

  it('accepts an ISO string', () => {
    expect(dayBucket('2024-01-10T10:00:00Z')).toBe('2024-01-10');
  });
});

describe('redactPII', () => {
  it('masks a +91 mobile number with spaces', () => {
    expect(redactPII('Call me on +91 98765 43210 today')).toBe('Call me on [redacted] today');
  });

  it('masks a bare 10-digit Indian mobile number', () => {
    expect(redactPII('reach me at 9876543210.')).toBe('reach me at [redacted].');
  });

  it('masks a hyphenated +91 number', () => {
    expect(redactPII('+91-9876543210')).toBe('[redacted]');
  });

  it('masks email addresses', () => {
    expect(redactPII('write to ravi.k+site@example.co.in please')).toBe('write to [redacted] please');
  });

  it('masks Aadhaar-like 12-digit numbers in 4-4-4 form, spaced or not', () => {
    expect(redactPII('my id 1234 5678 9012')).toBe('my id [redacted]');
    expect(redactPII('id 123456789012 here')).toBe('id [redacted] here');
    expect(redactPII('id 1234-5678-9012')).toBe('id [redacted]');
  });

  it('leaves ordinary numbers and text alone', () => {
    const text = 'Room 1234 on floor 2, shift at 10:30, 3 workers';
    expect(redactPII(text)).toBe(text);
  });

  it('redacts several kinds in one message', () => {
    expect(redactPII('a@b.com or 9876543210 or 1234 5678 9012')).toBe(
      '[redacted] or [redacted] or [redacted]',
    );
  });
});

describe('aggregateFeedback', () => {
  function response(i: number, ratings: [number, number, number, number], comment?: string): FeedbackResponse {
    const [safety, fairness, respect, workload] = ratings;
    return {
      id: `f${i}`,
      siteId: 'site-skyline',
      month: '2024-01',
      ratings: { safety, fairness, respect, workload },
      ...(comment !== undefined ? { comment } : {}),
    };
  }

  const five: FeedbackResponse[] = [
    response(1, [5, 3, 5, 1], 'Helmets were fine'),
    response(2, [4, 3, 5, 2]),
    response(3, [4, 4, 5, 2], 'Call 9876543210 for details'),
    response(4, [3, 4, 4, 3], '  '),
    response(5, [4, 2, 4, 2], 'Write to a@b.com'),
  ];

  it('returns null for 4 responses (default minimum group is 5)', () => {
    expect(aggregateFeedback(five.slice(0, 4))).toBeNull();
  });

  it('returns null for zero responses', () => {
    expect(aggregateFeedback([])).toBeNull();
  });

  it('averages each question to 1 dp for 5 responses', () => {
    // safety 5+4+4+3+4 = 20 / 5 = 4.0; fairness 3+3+4+4+2 = 16 / 5 = 3.2
    // respect 5+5+5+4+4 = 23 / 5 = 4.6; workload 1+2+2+3+2 = 10 / 5 = 2.0
    const agg = aggregateFeedback(five);
    expect(agg).not.toBeNull();
    expect(agg?.count).toBe(5);
    expect(agg?.averages).toEqual({ safety: 4, fairness: 3.2, respect: 4.6, workload: 2 });
  });

  it('rounds averages to 1 dp: safety 4,4,5 -> 13/3 = 4.3 with minGroup 3', () => {
    const three = [response(1, [4, 1, 1, 1]), response(2, [4, 1, 1, 1]), response(3, [5, 1, 1, 1])];
    expect(aggregateFeedback(three, 3)?.averages.safety).toBe(4.3);
  });

  it('includes only non-empty, redacted comments and does not return the raw PII', () => {
    const agg = aggregateFeedback(five);
    expect(agg?.comments.slice().sort()).toEqual(
      ['Call [redacted] for details', 'Helmets were fine', 'Write to [redacted]'].sort(),
    );
  });

  it('returns an empty comments list when nobody commented', () => {
    const quiet = [1, 2, 3, 4, 5].map((i) => response(i, [3, 3, 3, 3]));
    expect(aggregateFeedback(quiet)?.comments).toEqual([]);
  });
});

describe('feedbackDedupeKey', () => {
  const secret = 'dedupe-secret';

  it('is the HMAC-SHA256 hex of user, site and month', () => {
    const expected = createHmac('sha256', secret).update('w1|site-skyline|2024-01').digest('hex');
    expect(feedbackDedupeKey('w1', 'site-skyline', '2024-01', secret)).toBe(expected);
  });

  it('is 64 hex characters', () => {
    expect(feedbackDedupeKey('w1', 'site-skyline', '2024-01', secret)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('differs by month, so a new month can submit again', () => {
    expect(feedbackDedupeKey('w1', 'site-skyline', '2024-01', secret)).not.toBe(
      feedbackDedupeKey('w1', 'site-skyline', '2024-02', secret),
    );
  });

  it('differs by user, site and secret', () => {
    const base = feedbackDedupeKey('w1', 'site-skyline', '2024-01', secret);
    expect(feedbackDedupeKey('w2', 'site-skyline', '2024-01', secret)).not.toBe(base);
    expect(feedbackDedupeKey('w1', 'site-greenfield', '2024-01', secret)).not.toBe(base);
    expect(feedbackDedupeKey('w1', 'site-skyline', '2024-01', 'other')).not.toBe(base);
  });
});
