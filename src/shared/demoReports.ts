import type { Industry, Language, Severity } from './types';

/**
 * One realistic example report per industry, in every UI language, for demos. The report page can
 * fill it in; when AI triage is unavailable, an exact match gets this stored result (the same
 * category, urgency and English translation the AI gives) instead of keyword triage.
 */
export interface DemoReport {
  text: Record<Language, string>;
  textEn: string;
  category: string;
  severity: Severity;
}

export const DEMO_REPORTS: Record<Industry, DemoReport> = {
  construction: {
    text: {
      en: 'A worker nearly fell from the scaffolding on the fourth floor. There is no guard rail and nobody was given a safety harness.',
      hi: 'चौथी मंज़िल पर एक मज़दूर मचान से गिरते-गिरते बचा। वहाँ कोई रेलिंग नहीं है और किसी को सेफ्टी हार्नेस नहीं दिया गया।',
      ta: 'நான்காவது மாடியில் ஒரு தொழிலாளி சாரத்திலிருந்து கிட்டத்தட்ட விழுந்துவிட்டார். அங்கு தடுப்புக் கம்பி இல்லை, யாருக்கும் பாதுகாப்பு பெல்ட் கொடுக்கப்படவில்லை.',
    },
    textEn: 'A worker nearly fell from the scaffolding on the fourth floor. There is no guard rail and nobody was given a safety harness.',
    category: 'fall_height',
    severity: 'critical',
  },
  college: {
    text: {
      en: 'Bare electrical wires are hanging near the sink in the chemistry lab. Water splashes on them every day.',
      hi: 'केमिस्ट्री लैब में सिंक के पास बिजली के नंगे तार लटक रहे हैं। उन पर रोज़ पानी के छींटे पड़ते हैं।',
      ta: 'வேதியியல் ஆய்வகத்தில் சிங்க் அருகே மின் கம்பிகள் வெளியே தொங்கிக்கொண்டிருக்கின்றன. அவற்றின் மீது தினமும் தண்ணீர் தெறிக்கிறது.',
    },
    textEn: 'Bare electrical wires are hanging near the sink in the chemistry lab. Water splashes on them every day.',
    category: 'electrical',
    severity: 'critical',
  },
};

/** The example whose text (in any language) exactly matches, ignoring surrounding whitespace. */
export function findDemoReport(text: string): DemoReport | undefined {
  const needle = text.trim();
  return Object.values(DEMO_REPORTS).find((demo) => Object.values(demo.text).includes(needle));
}
