import { createHmac, randomInt } from 'node:crypto';
import type { FeedbackAggregate, FeedbackRatings, FeedbackResponse } from '../../shared/types';
import { istDay } from './time';

const CASE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const RATING_KEYS: (keyof FeedbackRatings)[] = ['safety', 'fairness', 'respect', 'workload'];

/** Random anonymous report code formatted XXXX-XXXX (8 characters from a 31-symbol alphabet). */
export function caseCode(): string {
  let raw = '';
  for (let i = 0; i < 8; i++) {
    raw += CASE_ALPHABET[randomInt(CASE_ALPHABET.length)] ?? 'A';
  }
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

/** IST calendar day for a report timestamp. The only time information stored for reports. */
export function dayBucket(date: Date | string): string {
  return istDay(date);
}

const PII_PATTERNS: RegExp[] = [
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  /(?<!\d)\d{4}[\s-]?\d{4}[\s-]?\d{4}(?!\d)/g,
  /(?:\+91[\s-]?)?(?<!\d)[6-9]\d{4}[\s-]?\d{5}(?!\d)/g,
];

/** Masks emails, Aadhaar-like 12-digit numbers and 10-digit Indian mobile numbers (optionally +91). */
export function redactPII(text: string): string {
  let out = text;
  for (const pattern of PII_PATTERNS) {
    out = out.replace(pattern, '[redacted]');
  }
  return out;
}

/**
 * Aggregates feedback into per-question averages (1 dp) and a shuffled list of redacted comments.
 * Returns null when there are fewer than minGroup responses, so small groups cannot be identified.
 */
export function aggregateFeedback(
  responses: FeedbackResponse[],
  minGroup = 5,
): FeedbackAggregate | null {
  if (responses.length < minGroup) return null;

  const averages = {} as FeedbackRatings;
  for (const key of RATING_KEYS) {
    const sum = responses.reduce((acc, r) => acc + r.ratings[key], 0);
    averages[key] = Math.round((sum / responses.length) * 10) / 10;
  }

  const comments = responses
    .map((r) => r.comment?.trim() ?? '')
    .filter((c) => c.length > 0)
    .map(redactPII);

  return { count: responses.length, averages, comments: shuffle(comments) };
}

/**
 * HMAC key used to stop duplicate feedback per user, site and month. Stored in a
 * separate set, never alongside the response.
 */
export function feedbackDedupeKey(
  userId: string,
  siteId: string,
  month: string,
  secret: string,
): string {
  return createHmac('sha256', secret).update(`${userId}|${siteId}|${month}`).digest('hex');
}

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    const a = out[i];
    const b = out[j];
    if (a === undefined || b === undefined) continue;
    out[i] = b;
    out[j] = a;
  }
  return out;
}
