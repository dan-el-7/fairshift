import { describe, expect, it } from 'vitest';
import { INDUSTRIES } from '../../../src/shared/industries';
import { heuristicTriage } from '../../../src/server/domain/triage';

const construction = INDUSTRIES.construction;
const college = INDUSTRIES.college;

describe('heuristicTriage', () => {
  it('a fall is critical and categorised as fall_height', () => {
    expect(heuristicTriage('Worker fell from the ladder on level 3', construction)).toEqual({
      category: 'fall_height',
      severity: 'critical',
    });
  });

  it('an electric shock is critical even though electrical is normally high', () => {
    expect(heuristicTriage('Exposed live wire, got a shock', construction)).toEqual({
      category: 'electrical',
      severity: 'critical',
    });
  });

  it('electrical hazards without injury are high', () => {
    expect(heuristicTriage('Exposed wire near the water tank', construction)).toEqual({
      category: 'electrical',
      severity: 'high',
    });
  });

  it('harassment is high', () => {
    expect(heuristicTriage('Supervisor shouted abusive threats at me', construction)).toEqual({
      category: 'harassment',
      severity: 'high',
    });
  });

  it('missing PPE is medium', () => {
    expect(heuristicTriage('Helmet not provided to workers', construction)).toEqual({
      category: 'ppe_missing',
      severity: 'medium',
    });
  });

  it('wage complaints map to wage_issue, matching "pay" as a word prefix', () => {
    expect(heuristicTriage('Salary not paid for two weeks', construction).category).toBe('wage_issue');
    expect(heuristicTriage('Payment delayed again', construction).category).toBe('wage_issue');
  });

  it('a suggestion is low severity', () => {
    expect(heuristicTriage('Please add a water cooler, it would be better', construction)).toEqual({
      category: 'other',
      severity: 'low',
    });
  });

  it('matches Hindi and Tamil keywords', () => {
    expect(heuristicTriage('बिजली का तार खुला है', construction)).toEqual({
      category: 'electrical',
      severity: 'high',
    });
    expect(heuristicTriage('ஹெல்மெட் இல்லை', construction).category).toBe('ppe_missing');
  });

  it('only returns categories from the industry config', () => {
    // fire is not a construction hazard: category falls back to other, but "fire" is still critical
    expect(heuristicTriage('fire extinguisher expired', construction)).toEqual({
      category: 'other',
      severity: 'critical',
    });
    expect(heuristicTriage('fire extinguisher expired', college).category).toBe('fire_safety');
  });

  it('college lab chemical spill is a chemical_lab report at medium severity', () => {
    expect(heuristicTriage('Chemical spill in the lab bench', college)).toEqual({
      category: 'chemical_lab',
      severity: 'medium',
    });
  });

  it('college workload complaints map to workload', () => {
    expect(heuristicTriage('Too much workload, long hours every day', college).category).toBe('workload');
  });

  it('unmatched text is other / medium', () => {
    expect(heuristicTriage('Nothing in particular to report', construction)).toEqual({
      category: 'other',
      severity: 'medium',
    });
  });

  it('empty text is other / medium', () => {
    expect(heuristicTriage('', college)).toEqual({ category: 'other', severity: 'medium' });
  });

  it('every returned category is in the industry hazard list', () => {
    for (const cfg of [construction, college]) {
      for (const text of ['fell', 'shock', 'helmet', 'salary', 'fire', 'lab', 'blah', 'shouted']) {
        expect(cfg.hazardCategories).toContain(heuristicTriage(text, cfg).category);
      }
    }
  });
});
