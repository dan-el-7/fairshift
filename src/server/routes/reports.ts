import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import type { CreateReportResponse, ReportPublic } from '../../shared/api';
import { INDUSTRIES } from '../../shared/industries';
import type { Report } from '../../shared/types';
import type { Deps } from '../app';
import { dayBucket, redactPII } from '../domain/anonymity';
import type { AppEnv } from '../middleware/auth';
import { AudioUnavailableError } from '../services/ai';
import { freshCaseCode } from '../services/reports';
import { jsonError, parseBody } from './http';

const MAX_AUDIO_BASE64 = 1_900_000;
const CASE_CODE_RE = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/;

const createSchema = z
  .object({
    siteId: z.string().min(1).max(64),
    language: z.enum(['en', 'hi', 'ta']),
    text: z.string().trim().max(4_000).optional(),
    audioBase64: z.string().min(1).max(MAX_AUDIO_BASE64).optional(),
    audioMime: z.enum(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/wav', 'audio/mpeg']).optional(),
    category: z.string().max(64).optional(),
  })
  .refine((b) => (b.text !== undefined && b.text.length > 0) || b.audioBase64 !== undefined, {
    message: 'text or audio is required',
    path: ['text'],
  });

/**
 * Anonymous safety reports. The reporter's identity is never read or stored: a session cookie,
 * if present, is ignored, and the stored report has no worker id, time of day or IP.
 */
export function reportRoutes(deps: Deps): Hono<AppEnv> {
  const api = new Hono<AppEnv>();
  const { repo, ai } = deps;

  api.post('/reports', async (c) => {
    const body = await parseBody(c, createSchema);
    if (body instanceof Response) return body;

    const site = await repo.getSite(body.siteId);
    if (!site) return jsonError(c, 404, 'unknown site');
    const cfg = INDUSTRIES[site.industry];

    let analysis;
    try {
      analysis = await ai.analyse({
        text: body.text,
        audioBase64: body.audioBase64,
        audioMime: body.audioMime,
        language: body.language,
        cfg,
      });
    } catch (err) {
      if (err instanceof AudioUnavailableError) {
        return jsonError(c, 422, 'voice reports are unavailable right now; please type your report');
      }
      throw err;
    }

    const supplied = body.category !== undefined && cfg.hazardCategories.includes(body.category) ? body.category : undefined;
    const category =
      supplied ?? (cfg.hazardCategories.includes(analysis.category) ? analysis.category : 'other');

    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- an empty AI transcript must fall back to the reporter's own text
    const text = redactPII(analysis.text || body.text || '');
    const reporterToken = randomBytes(32).toString('base64url');
    const report: Report = {
      id: randomUUID(),
      caseCode: await freshCaseCode(repo),
      siteId: site.id,
      category,
      severity: analysis.severity,
      language: body.language,
      text,
      textEn: redactPII(analysis.textEn || text),
      status: 'open',
      version: 1,
      reporterSecretHash: createHash('sha256').update(reporterToken).digest('hex'),
      createdDay: dayBucket(deps.now()),
      updates: [],
    };
    await repo.saveReport(report);

    const response: CreateReportResponse = {
      caseCode: report.caseCode,
      category: report.category,
      severity: report.severity,
      reporterToken,
    };
    c.header('Cache-Control', 'no-store');
    return c.json(response);
  });

  api.get('/reports/track/:caseCode', async (c) => {
    const code = c.req.param('caseCode').toUpperCase();
    if (!CASE_CODE_RE.test(code)) return jsonError(c, 404, 'case not found');
    const report = await repo.getReportByCode(code);
    if (!report) return jsonError(c, 404, 'case not found');

    const publicView: ReportPublic = {
      caseCode: report.caseCode,
      category: report.category,
      severity: report.severity,
      status: report.status,
      createdDay: report.createdDay,
      updates: report.updates,
    };
    c.header('Cache-Control', 'no-store');
    return c.json({ ...publicView, version: report.version ?? 0, confirmationAvailable: Boolean(report.reporterSecretHash), fixResponse: report.fixResponse });
  });

  api.post('/reports/track/:caseCode/respond', async (c) => {
    const schema = z.object({ reporterToken: z.string().min(32).max(128), decision: z.enum(['confirmed', 'disputed']), expectedVersion: z.number().int().nonnegative(), note: z.string().trim().max(500).optional() });
    const body = await parseBody(c, schema);
    if (body instanceof Response) return body;
    const code = c.req.param('caseCode').toUpperCase();
    if (!CASE_CODE_RE.test(code)) return jsonError(c, 404, 'case not found');
    const existing = await repo.getReportByCode(code);
    if (!existing) return jsonError(c, 404, 'case not found');
    const supplied = createHash('sha256').update(body.reporterToken).digest();
    const expected = existing.reporterSecretHash ? Buffer.from(existing.reporterSecretHash, 'hex') : Buffer.alloc(32);
    if (!existing.reporterSecretHash || !timingSafeEqual(supplied, expected)) return jsonError(c, 403, 'confirmation unavailable');
    if (existing.status !== 'resolved') return jsonError(c, 409, 'report is not resolved');
    const version = existing.version ?? 0;
    if (version !== body.expectedVersion) return jsonError(c, 409, 'report has changed');
    if (existing.fixResponse) return jsonError(c, 409, 'reporter already responded');
    const status = body.decision === 'disputed' ? 'open' : existing.status;
    const update: Report['updates'][number] = { status, day: dayBucket(deps.now()), fixResponse: body.decision, actor: 'reporter' };
    if (body.note?.length) update.note = redactPII(body.note);
    const saved: Report = { ...existing, status, version: version + 1, fixResponse: body.decision, updates: [...existing.updates, update] };
    if (!(await repo.compareAndSaveReport(saved, version))) return jsonError(c, 409, 'report has changed');
    const publicView: ReportPublic = { caseCode: saved.caseCode, category: saved.category, severity: saved.severity, status: saved.status, createdDay: saved.createdDay, updates: saved.updates };
    c.header('Cache-Control', 'no-store');
    return c.json({ ...publicView, version: saved.version, confirmationAvailable: true, fixResponse: saved.fixResponse });
  });

  return api;
}
