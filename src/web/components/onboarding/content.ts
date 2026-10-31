import type { Language, Role } from '../../../shared/types';

// Copy, slide content and timing for the onboarding flow.

export interface Slide {
  title: string;
  body: string;
}

export type Slides = [Slide, Slide, Slide, Slide];

export interface Copy {
  greeting: string;
  tap: string;
  roles: Record<Role, Slides>;
  next: string;
  back: string;
  skip: string;
  start: string;
  listen: string;
  /** Contains {n} and {total}. */
  stepOf: string;
}

/** Strings for the onboarding flow. All three languages live here, so the flow works before a language is chosen. */
export const COPY: Record<Language, Copy> = {
  en: {
    greeting: 'Hello',
    tap: 'Tap to begin',
    roles: {
      worker: [
        { title: 'Check in with one tap', body: 'Scan the site QR or use your location. Your hours and overtime are counted for you.' },
        { title: 'Your pay, explained', body: 'Every line shows the maths. Listen to it in your language.' },
        { title: 'Speak up safely', body: 'Report by voice or text and get a case code. Nobody can see who you are.' },
        { title: 'Your skills go with you', body: 'A verified record that any employer can check.' },
      ],
      admin: [
        { title: 'Your site at a glance', body: 'Attendance, overtime and alerts on one dashboard.' },
        { title: 'Act on reports fast', body: 'Sorted by severity, overdue ones first. Update the reporter by case code.' },
        { title: 'Spot burnout early', body: 'Fatigue alerts and quit-risk, each with clear reasons. Anonymous reports are never used.' },
        { title: 'QR kiosk check-in', body: "Show a rotating QR at the gate. It can't be screenshotted and reused." },
      ],
    },
    next: 'Next',
    back: 'Back',
    skip: 'Skip',
    start: "Let's go",
    listen: 'Listen',
    stepOf: 'Step {n} of {total}',
  },
  hi: {
    greeting: 'नमस्ते',
    tap: 'शुरू करने के लिए टैप करें',
    roles: {
      worker: [
        { title: 'एक टैप में हाज़िरी लगाएँ', body: 'साइट का QR स्कैन करें या अपनी लोकेशन इस्तेमाल करें। आपके घंटे और ओवरटाइम अपने-आप गिने जाते हैं।' },
        { title: 'आपकी मज़दूरी, साफ़ समझाई गई', body: 'हर लाइन में हिसाब दिखता है। अपनी भाषा में सुनें।' },
        { title: 'बेखौफ़ होकर बोलें', body: 'आवाज़ या लिखकर रिपोर्ट करें और केस कोड पाएँ। कोई नहीं देख सकता कि आप कौन हैं।' },
        { title: 'आपका हुनर आपके साथ चलता है', body: 'एक सत्यापित रिकॉर्ड, जिसे कोई भी नियोक्ता जाँच सकता है।' },
      ],
      admin: [
        { title: 'आपकी साइट एक नज़र में', body: 'हाज़िरी, ओवरटाइम और अलर्ट एक ही डैशबोर्ड पर।' },
        { title: 'रिपोर्ट पर तुरंत कार्रवाई', body: 'गंभीरता के हिसाब से छँटी हुई, पुरानी पेंडिंग पहले। केस कोड से रिपोर्टर को अपडेट करें।' },
        { title: 'थकान के संकेत जल्दी पहचानें', body: 'थकान और नौकरी छोड़ने के जोखिम के अलर्ट, साफ़ कारणों के साथ। गुमनाम रिपोर्ट कभी इस्तेमाल नहीं होतीं।' },
        { title: 'QR किऑस्क से हाज़िरी', body: 'गेट पर घूमता हुआ QR दिखाएँ। इसका स्क्रीनशॉट लेकर दोबारा इस्तेमाल नहीं हो सकता।' },
      ],
    },
    next: 'अगला',
    back: 'पीछे',
    skip: 'छोड़ें',
    start: 'चलिए',
    listen: 'सुनें',
    stepOf: 'चरण {n} / {total}',
  },
  ta: {
    greeting: 'வணக்கம்',
    tap: 'தொடங்க தட்டவும்',
    roles: {
      worker: [
        { title: 'ஒரே தட்டலில் வருகை பதிவு', body: 'தள QR-ஐ ஸ்கேன் செய்யுங்கள் அல்லது இருப்பிடத்தைப் பயன்படுத்துங்கள். உங்கள் நேரமும் கூடுதல் நேரமும் உங்களுக்காகக் கணக்கிடப்படும்.' },
        { title: 'உங்கள் ஊதியம், தெளிவாக', body: 'ஒவ்வொரு வரியிலும் கணக்கு காட்டப்படும். உங்கள் மொழியில் கேட்கலாம்.' },
        { title: 'பாதுகாப்பாகக் குரல் கொடுங்கள்', body: 'குரல் அல்லது எழுத்து மூலம் புகார் தெரிவித்து வழக்குக் குறியீட்டைப் பெறுங்கள். நீங்கள் யார் என்பது யாருக்கும் தெரியாது.' },
        { title: 'உங்கள் திறன்கள் உங்களுடன் வரும்', body: 'எந்த முதலாளியும் சரிபார்க்கக்கூடிய உறுதிசெய்யப்பட்ட பதிவு.' },
      ],
      admin: [
        { title: 'உங்கள் தளம், ஒரு பார்வையில்', body: 'வருகை, கூடுதல் நேரம் மற்றும் எச்சரிக்கைகள் ஒரே டாஷ்போர்டில்.' },
        { title: 'புகார்களுக்கு விரைவாகச் செயல்படுங்கள்', body: 'தீவிரத்தின்படி வரிசைப்படுத்தப்படும்; தாமதமானவை முதலில். வழக்குக் குறியீட்டின் மூலம் புகார்தாரருக்குத் தெரிவியுங்கள்.' },
        { title: 'சோர்வை முன்கூட்டியே கண்டறியுங்கள்', body: 'சோர்வு மற்றும் வேலை விட்டுப் போகும் அபாய எச்சரிக்கைகள், தெளிவான காரணங்களுடன். அநாமதேய புகார்கள் ஒருபோதும் பயன்படுத்தப்படாது.' },
        { title: 'QR கியோஸ்க் வருகைப் பதிவு', body: 'வாயிலில் சுழலும் QR-ஐக் காட்டுங்கள். இதை ஸ்கிரீன்ஷாட் எடுத்து மீண்டும் பயன்படுத்த முடியாது.' },
      ],
    },
    next: 'அடுத்து',
    back: 'பின்',
    skip: 'தவிர்',
    start: 'வாருங்கள்',
    listen: 'கேளுங்கள்',
    stepOf: 'படி {n} / {total}',
  },
};

export type ArtKind = 'phone' | 'receipt' | 'bubble' | 'badge' | 'dashboard' | 'flag' | 'pulse' | 'qr';

/** Illustration for each slide, in order. */
export const ART: Record<Role, [ArtKind, ArtKind, ArtKind, ArtKind]> = {
  worker: ['phone', 'receipt', 'bubble', 'badge'],
  admin: ['dashboard', 'flag', 'pulse', 'qr'],
};

/** Order in which the hello greetings cycle. */
export const ORDER: Language[] = ['en', 'hi', 'ta'];
export const SWIPE_PX = 50;
export const GREET_MS = 2900;
export const EXIT_MS = 300;
export const TITLE_ID = 'ob-title';
export const TAP_ID = 'ob-tap-label';
export const HELLO_LABEL = ORDER.map((l) => COPY[l].greeting).join(' · ');
export const TAP_LABEL = ORDER.map((l) => COPY[l].tap).join(' · ');
export const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
