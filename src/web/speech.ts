import type { Language } from '../shared/types';

const TAGS: Record<Language, string> = { en: 'en-IN', hi: 'hi-IN', ta: 'ta-IN' };
/** Chrome lists voices asynchronously. Wait this long for them before deciding on a fallback. */
const VOICE_WAIT_MS = 600;
/** Server audio kept in memory per page, by language and text. */
const AUDIO_CACHE_MAX = 30;

/** Device speech or server audio (fetch + Audio) can read text aloud. */
export function canSpeak(): boolean {
  if (typeof window === 'undefined') return false;
  const device = 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
  const server = typeof Audio !== 'undefined' && typeof fetch === 'function' && typeof URL.createObjectURL === 'function';
  return device || server;
}

/**
 * Whether a voice for this language is installed, so the UI can hide read-aloud when there is none.
 * Returns true while the device has not listed any voices yet (browsers load them late), so
 * read-aloud is not hidden by mistake.
 */
export function voicesAvailable(lang: Language): boolean {
  if (!canSpeak()) return false;
  try {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length === 0) return true;
    const tag = TAGS[lang];
    return voices.some((v) => v.lang === tag || v.lang.startsWith(lang));
  } catch {
    return false;
  }
}

/** Bumped by every speak call, so a slow answer for an earlier call never plays over a newer one. */
let generation = 0;
let current: { audio: HTMLAudioElement; url: string } | null = null;
const audioCache = new Map<string, Blob>();

function stopPlayback(): void {
  if (current) {
    current.audio.pause();
    URL.revokeObjectURL(current.url);
    current = null;
  }
  try {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  } catch {
    // Nothing to stop.
  }
}

/** A device voice for the language: exact tag first, then the same primary language. Never another language. */
function deviceVoice(lang: Language): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((v) => v.lang === TAGS[lang]) ?? voices.find((v) => v.lang.split(/[-_]/)[0]?.toLowerCase() === lang);
}

/** Resolves at once when voices are listed, otherwise on 'voiceschanged' or after VOICE_WAIT_MS. */
function waitForVoices(): Promise<void> {
  const synth = window.speechSynthesis;
  if (synth.getVoices().length > 0) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      synth.removeEventListener('voiceschanged', done);
      resolve();
    };
    const timer = setTimeout(done, VOICE_WAIT_MS);
    synth.addEventListener('voiceschanged', done);
  });
}

function speakOnDevice(text: string, lang: Language, voice?: SpeechSynthesisVoice): void {
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = TAGS[lang];
  if (voice) utterance.voice = voice;
  utterance.rate = 0.95;
  synth.speak(utterance);
}

/** Audio for a text from the server, cached per language and text. Null when the server cannot speak. */
async function fetchAudio(text: string, lang: Language): Promise<Blob | null> {
  const key = `${lang}|${text}`;
  const cached = audioCache.get(key);
  if (cached) {
    audioCache.delete(key);
    audioCache.set(key, cached);
    return cached;
  }
  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, lang }),
  });
  if (!res.ok) return null;
  const blob = await res.blob();
  audioCache.set(key, blob);
  if (audioCache.size > AUDIO_CACHE_MAX) {
    const oldest = audioCache.keys().next().value;
    if (oldest !== undefined) audioCache.delete(oldest);
  }
  return blob;
}

/** Plays the server's audio. Returns false when it could not start, so the caller can fall back. */
async function playServerAudio(text: string, lang: Language, mine: number): Promise<boolean> {
  let blob: Blob | null;
  try {
    blob = await fetchAudio(text, lang);
  } catch {
    return false;
  }
  if (!blob) return false;
  if (mine !== generation) return true; // Superseded by a newer call: play nothing, fall back to nothing.

  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  const release = () => {
    URL.revokeObjectURL(url);
    if (current?.audio === audio) current = null;
  };
  audio.onended = release;
  audio.onerror = release;
  current = { audio, url };
  try {
    await audio.play();
    return true;
  } catch {
    release();
    return false;
  }
}

async function run(text: string, lang: Language, mine: number): Promise<void> {
  const device = 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
  if (device) await waitForVoices();
  if (mine !== generation) return;

  const voice = device ? deviceVoice(lang) : undefined;
  if (device && voice) {
    speakOnDevice(text, lang, voice);
    return;
  }
  if (await playServerAudio(text, lang, mine)) return;
  if (mine !== generation) return;
  // Only English may use the device's default voice. Any other default would read Devanagari or Tamil as junk.
  if (lang === 'en' && device) speakOnDevice(text, 'en');
}

/**
 * Read text aloud in the given language. A device voice for the language is used when there is
 * one. Otherwise the server's speech is played. English alone falls back to the device's default
 * voice; Hindi and Tamil never do. Does nothing when neither is available.
 */
export function speak(text: string, lang: Language): void {
  const clean = text.trim();
  if (!clean || !canSpeak()) return;
  generation += 1;
  stopPlayback();
  run(clean, lang, generation).catch(() => {
    // Speech is an extra. A failure here must never break the page.
  });
}

/** A finished voice note: audio as base64 (no data: prefix) and a bare MIME type. */
export interface Clip {
  base64: string;
  mime: string;
}

/** A recording in progress. Its end is reported through RecordOptions.onFinished, for any reason. */
export interface Recording {
  /** Ends the recording now. onFinished then delivers the clip. */
  stop(): void;
  /** Ends the recording and throws the audio away. onFinished is not called. */
  cancel(): void;
}

export interface RecordOptions {
  /** Time limit in ms; the recording stops itself when it is reached. Default 60 s. */
  maxMs?: number;
  /** Aborting before the microphone is granted releases the late stream and rejects the request. */
  signal?: AbortSignal;
  /** Called once when the recording ends: stopped by the user, the time limit, or an error (clip null). */
  onFinished: (clip: Clip | null) => void;
}

export function canRecord(): boolean {
  // Typed as always present, but browsers without media devices leave it undefined.
  const devices = typeof navigator === 'undefined' ? undefined : (navigator.mediaDevices as MediaDevices | undefined);
  return (
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!devices?.getUserMedia
  );
}

function blobToBase64(blob: Blob): Promise<Clip> {
  const mime = (blob.type || 'audio/webm').split(';')[0] ?? 'audio/webm';
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      const comma = dataUrl.indexOf(',');
      resolve({ base64: comma >= 0 ? dataUrl.slice(comma + 1) : '', mime });
    };
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Starts a microphone recording. Throws when recording is unsupported, denied, or aborted while the
 * permission prompt was open. Every ending reaches onFinished exactly once, except after cancel().
 */
export async function recordAudio({ maxMs = 60000, signal, onFinished }: RecordOptions): Promise<Recording> {
  if (!canRecord()) throw new Error('Recording is not supported');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  if (signal?.aborted) {
    stream.getTracks().forEach((track) => track.stop());
    throw new DOMException('Recording was cancelled', 'AbortError');
  }
  const preferred = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported(m));
  const recorder = preferred ? new MediaRecorder(stream, { mimeType: preferred }) : new MediaRecorder(stream);
  const chunks: Blob[] = [];
  const releaseMic = () => stream.getTracks().forEach((track) => track.stop());
  let cancelled = false;
  let reported = false;
  const report = (clip: Clip | null) => {
    if (cancelled || reported) return;
    reported = true;
    onFinished(clip);
  };

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  recorder.onstop = () => {
    releaseMic();
    if (cancelled) return;
    const blob = new Blob(chunks, { type: recorder.mimeType || (preferred ?? 'audio/webm') });
    blobToBase64(blob).then(report, () => report(null));
  };
  recorder.onerror = () => {
    releaseMic();
    report(null);
  };

  recorder.start(1000);
  const timer = setTimeout(() => stop(), maxMs);

  function stop(): void {
    clearTimeout(timer);
    if (recorder.state !== 'inactive') recorder.stop();
  }

  return {
    stop,
    cancel: () => {
      cancelled = true;
      clearTimeout(timer);
      releaseMic();
      if (recorder.state !== 'inactive') recorder.stop();
    },
  };
}
