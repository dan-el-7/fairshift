import type { IndustryConfig, Severity } from '../../shared/types';

/** Ordered by precedence: the first matching category (within the industry's list) wins. */
const CATEGORY_KEYWORDS: [string, string[]][] = [
  ['harassment', ['harass', 'abuse', 'threat', 'insult', 'molest', 'bully', 'shout', 'उत्पीड़न', 'துன்புறுத்', 'गाली']],
  ['electrical', ['electr', 'wire', 'wiring', 'shock', 'spark', 'short circuit', 'current', 'bijli', 'बिजली', 'करंट', 'மின்']],
  ['fire_safety', ['fire', 'smoke', 'extinguish', 'alarm', 'आग', 'தீ']],
  ['chemical_lab', ['chemical', 'acid', 'lab', 'fumes', 'solvent', 'spill', 'gas leak']],
  ['slippery_floor', ['slip', 'slippery', 'wet floor', 'puddle']],
  ['fall_height', ['fall', 'fell', 'height', 'ladder', 'roof', 'गिर', 'விழு']],
  ['scaffolding', ['scaffold', 'platform', 'bamboo', 'impalca']],
  ['heavy_machinery', ['machine', 'crane', 'excavator', 'jcb', 'forklift', 'mixer', 'मशीन', 'இயந்திர']],
  ['ppe_missing', ['helmet', 'gloves', 'goggles', 'ppe', 'harness', 'safety shoe', 'हेलमेट', 'ஹெல்மெட்']],
  ['heat_stress', ['heat', 'dehydrat', 'faint', 'sunstroke', 'गर्मी', 'வெப்ப']],
  ['workload', ['workload', 'overwork', 'overtime', 'understaff', 'long hours', 'exhaust', 'too much work']],
  ['wage_issue', ['wage', 'salary', 'pay', 'unpaid', 'deduct', 'advance', 'मजदूरी', 'वेतन', 'சம்பளம்', 'ஊதியம்']],
];

const CRITICAL_WORDS = [
  'fell', 'fall', 'blood', 'injur', 'fire', 'shock', 'collapse', 'गिर', 'आग', 'தீ', 'விழு',
];

const SUGGESTION_WORDS = ['suggest', 'idea', 'could you', 'please add', 'would be better', 'recommend', 'improve'];

/** Matches a keyword at the start of a word, for Latin and native scripts. */
function containsWord(text: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\p{L}\\p{M}])${escaped}`, 'iu').test(text);
}

function anyWord(text: string, words: string[]): boolean {
  return words.some((w) => containsWord(text, w));
}

/**
 * Keyword-based fallback classifier used when the AI service is unavailable.
 * Category is always one of cfg.hazardCategories ('other' when nothing matches).
 */
export function heuristicTriage(
  text: string,
  cfg: IndustryConfig,
): { category: string; severity: Severity } {
  const category =
    CATEGORY_KEYWORDS.find(([name, words]) => cfg.hazardCategories.includes(name) && anyWord(text, words))?.[0] ??
    'other';

  let severity: Severity = 'medium';
  if (anyWord(text, CRITICAL_WORDS)) severity = 'critical';
  else if (category === 'electrical' || category === 'harassment') severity = 'high';
  else if (anyWord(text, SUGGESTION_WORDS)) severity = 'low';

  return { category, severity };
}
