import { describe, expect, it } from 'vitest';
import { DEMO_REPORTS } from '../../../src/shared/demoReports';
import { INDUSTRIES } from '../../../src/shared/industries';
import { heuristicAi } from '../../../src/server/services/ai';

describe('demo example triage without the AI', () => {
  it('gives the Hindi construction example its stored category, urgency and English translation', async () => {
    const demo = DEMO_REPORTS.construction;
    const result = await heuristicAi().analyse({ text: demo.text.hi, language: 'hi', cfg: INDUSTRIES.construction });

    expect(result).toEqual({ text: demo.text.hi, textEn: demo.textEn, category: 'fall_height', severity: 'critical' });
  });

  it('uses keyword triage when the example does not belong to the site industry', async () => {
    const result = await heuristicAi().analyse({
      text: DEMO_REPORTS.college.text.en,
      language: 'en',
      cfg: INDUSTRIES.construction,
    });

    expect(INDUSTRIES.construction.hazardCategories).toContain(result.category);
    expect(result.textEn).toBe(DEMO_REPORTS.college.text.en);
  });

  it('every example category exists in its industry', () => {
    for (const [industry, demo] of Object.entries(DEMO_REPORTS)) {
      expect(INDUSTRIES[industry as keyof typeof INDUSTRIES].hazardCategories).toContain(demo.category);
    }
  });
});
