import type { Language } from '../shared/types';

const TAGS: Record<Language, string> = { en: 'en-IN', hi: 'hi-IN', ta: 'ta-IN' };

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

/** Read text aloud in the given language. Does nothing when speech synthesis is unavailable. */
export function speak(text: string, lang: Language): void {
  if (!canSpeak() || !text.trim()) return;
  try {
    const synth = window.speechSynthesis;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const tag = TAGS[lang];
    utterance.lang = tag;
    const voices = synth.getVoices();
    const voice = voices.find((v) => v.lang === tag) ?? voices.find((v) => v.lang.startsWith(lang));
    if (voice) utterance.voice = voice;
    utterance.rate = 0.95;
    synth.speak(utterance);
  } catch {
    // Speech is an extra. A failure here must never break the page.
  }
}

export interface Recording {
  /** Stops recording and resolves with the audio as base64 (no data: prefix) and a bare MIME type. */
  stop(): Promise<{ base64: string; mime: string }>;
}

export function canRecord(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

function blobToBase64(blob: Blob): Promise<{ base64: string; mime: string }> {
  const mime = (blob.type || 'audio/webm').split(';')[0] ?? 'audio/webm';
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? '');
      const comma = dataUrl.indexOf(',');
      resolve({ base64: comma >= 0 ? dataUrl.slice(comma + 1) : '', mime });
    };
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(blob);
  });
}

/** Starts a microphone recording that stops itself after maxMs. Throws when recording is unsupported or denied. */
export async function recordAudio(maxMs = 60000): Promise<Recording> {
  if (!canRecord()) throw new Error('Recording is not supported');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const preferred = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported(m));
  const recorder = preferred ? new MediaRecorder(stream, { mimeType: preferred }) : new MediaRecorder(stream);
  const chunks: Blob[] = [];
  const releaseMic = () => stream.getTracks().forEach((track) => track.stop());

  const finished = new Promise<{ base64: string; mime: string }>((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => {
      releaseMic();
      const blob = new Blob(chunks, { type: recorder.mimeType || preferred || 'audio/webm' });
      blobToBase64(blob).then(resolve, reject);
    };
    recorder.onerror = () => {
      releaseMic();
      reject(new Error('Recording failed'));
    };
  });
  finished.catch(() => undefined);

  recorder.start(1000);
  const timer = setTimeout(() => {
    if (recorder.state !== 'inactive') recorder.stop();
  }, maxMs);

  return {
    stop: () => {
      clearTimeout(timer);
      if (recorder.state !== 'inactive') recorder.stop();
      return finished;
    },
  };
}
