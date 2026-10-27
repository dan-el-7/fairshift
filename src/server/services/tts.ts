import { createHash } from 'node:crypto';
import type { Language } from '../../shared/types';
import { describeError, type GenAiClient } from './ai';
import { listModelNames, newestFirst, withTimeout } from './models';
import type { KvClient } from '../store/redis';

/** Speech for one piece of text. Null from synthesize means "unavailable": the caller answers 503. */
export interface Tts {
  synthesize(text: string, lang: Language): Promise<{ wav: Uint8Array } | null>;
}

export interface TtsOptions {
  /** Gemini client, or null when Gemini is not configured (synthesize then returns null). */
  client: GenAiClient | null;
  /** Shared store for the audio cache. Without it, a small in-memory cache is used. */
  kv?: KvClient;
  /** GEMINI_TTS_MODEL. When set, skips model discovery. */
  model?: string;
  now?: () => Date;
}

export const TTS_MAX_CHARS = 600;
/** Whole-request budget for one synthesis, including model discovery. */
export const TTS_TIMEOUT_MS = 15_000;
const VOICE = 'Kore';
/** Upstash values are capped at 1 MB; larger WAV files stay in memory. */
const KV_MAX_BASE64 = 900_000;
const MEMORY_CACHE_MAX = 100;
const DEFAULT_RATE = 24_000;
const LANGUAGE_NAME: Record<Language, string> = { en: 'Indian English', hi: 'Hindi', ta: 'Tamil' };

/** Wraps raw 16-bit little-endian PCM in a RIFF/WAVE header. The header is 44 bytes. */
export function pcmToWav(pcm: Uint8Array, sampleRate: number, channels = 1, bitsPerSample = 16): Uint8Array {
  const out = new Uint8Array(44 + pcm.length);
  const view = new DataView(out.buffer);
  const ascii = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) out[offset + i] = s.charCodeAt(i);
  };
  const blockAlign = (channels * bitsPerSample) / 8;
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  ascii(36, 'data');
  view.setUint32(40, pcm.length, true);
  out.set(pcm, 44);
  return out;
}

/** Sample rate from a MIME type such as 'audio/L16;codec=pcm;rate=24000'. */
function sampleRateOf(mimeType: string | undefined): number {
  const match = /rate=(\d+)/.exec(mimeType ?? '');
  return match?.[1] ? Number(match[1]) : DEFAULT_RATE;
}

/** Flash first, then pro, then anything else; newer versions first within each group. */
function ttsRank(name: string): number {
  if (/flash/i.test(name)) return 0;
  if (/pro/i.test(name)) return 1;
  return 2;
}

/**
 * Text to speech through Gemini's audio output. Returns WAV bytes or null. Never logs the text.
 * Results are cached by model, voice, language and text, so repeated read-aloud costs nothing.
 */
export function createTts(options: TtsOptions): Tts {
  const { client, kv } = options;
  const now = options.now ?? (() => new Date());
  const memory = new Map<string, Uint8Array>();

  async function pickModel(gen: GenAiClient): Promise<string | null> {
    if (options.model) return options.model;
    const names = (await listModelNames(gen)).filter((n) => /tts/i.test(n));
    names.sort((a, b) => ttsRank(a) - ttsRank(b) || newestFirst(a, b));
    return names[0] ?? null;
  }

  async function readCache(key: string): Promise<Uint8Array | null> {
    const hit = memory.get(key);
    if (hit) {
      // Re-insert so the Map's iteration order tracks recency (least recent first).
      memory.delete(key);
      memory.set(key, hit);
      return hit;
    }
    if (!kv) return null;
    try {
      const raw = await kv.get(key);
      return raw ? new Uint8Array(Buffer.from(raw, 'base64')) : null;
    } catch {
      return null;
    }
  }

  async function writeCache(key: string, wav: Uint8Array): Promise<void> {
    const base64Length = Math.ceil(wav.length / 3) * 4;
    if (kv && base64Length < KV_MAX_BASE64) {
      try {
        await kv.set(key, Buffer.from(wav).toString('base64'));
        return;
      } catch {
        // Fall through to memory: the audio is still worth keeping for this instance.
      }
    }
    memory.delete(key);
    memory.set(key, wav);
    if (memory.size > MEMORY_CACHE_MAX) {
      const oldest = memory.keys().next().value;
      if (oldest !== undefined) memory.delete(oldest);
    }
  }

  async function generate(gen: GenAiClient, model: string, lang: Language, text: string, timeoutMs: number): Promise<Uint8Array> {
    const response = await withTimeout(
      gen.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [{ text: `Read this aloud clearly and calmly in ${LANGUAGE_NAME[lang]}:\n${text}` }],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } },
        },
      }),
      timeoutMs,
    );
    const inline = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
    if (!inline?.data) throw new Error('no audio in the response');
    return pcmToWav(new Uint8Array(Buffer.from(inline.data, 'base64')), sampleRateOf(inline.mimeType));
  }

  return {
    async synthesize(raw, lang) {
      const text = raw.trim();
      if (!client || text.length === 0 || text.length > TTS_MAX_CHARS) return null;
      const deadline = now().getTime() + TTS_TIMEOUT_MS;

      try {
        // Keyed without the model so a cache hit never has to list models first (that call is slow).
        const key = `fs:tts:${createHash('sha256').update(`${VOICE}|${lang}|${text}`).digest('hex')}`;
        const cached = await readCache(key);
        if (cached) return { wav: cached };

        const model = await pickModel(client);
        if (!model) return null;

        const wav = await generate(client, model, lang, text, Math.max(1, deadline - now().getTime()));
        await writeCache(key, wav);
        return { wav };
      } catch (err) {
        console.warn('speech synthesis unavailable:', describeError(err));
        return null;
      }
    },
  };
}
