import { randomUUID } from 'node:crypto';
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
      createdDay: dayBucket(deps.now()),
      updates: [],
    };
    await repo.saveReport(report);

    const response: CreateReportResponse = {
      caseCode: report.caseCode,
      category: report.category,
      severity: report.severity,
    };
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
    return c.json(publicView);
  });

  return api;
}
