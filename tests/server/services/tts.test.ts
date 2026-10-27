import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GenAiClient } from '../../../src/server/services/ai';
import { createTts, pcmToWav, stripProvenance, TTS_MAX_CHARS } from '../../../src/server/services/tts';
import type { KvClient } from '../../../src/server/store/redis';

const ascii = (bytes: Uint8Array, from: number, length: number) => String.fromCharCode(...bytes.slice(from, from + length));

/** Four 16-bit mono samples: 0x0001, 0x0002, 0x0003, 0x0004. */
const PCM = new Uint8Array([1, 0, 2, 0, 3, 0, 4, 0]);

interface Call {
  model: string;
  contents: unknown;
  config: Record<string, unknown>;
}

/** A fake client. The listing names the models; generateContent returns audio as base64 PCM. */
function fakeTtsClient(options: { names?: string[]; fail?: boolean; audio?: boolean } = {}) {
  const calls: Call[] = [];
  const generateContent = vi.fn(async (params: { model: string; contents: unknown; config: Record<string, unknown> }) => {
    calls.push({ model: params.model, contents: params.contents, config: params.config });
    if (options.fail) throw new Error('upstream exploded');
    if (options.audio === false) return { candidates: [{ content: { parts: [{ text: 'no audio' }] } }] };
    return {
      candidates: [
        {
          content: {
            parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: Buffer.from(PCM).toString('base64') } }],
          },
        },
      ],
    };
  });
  const names = options.names ?? ['gemini-3.8-flash', 'gemini-2.5-pro-preview-tts', 'gemini-3.1-flash-tts-preview'];
  const list = vi.fn(async () => ({
    async *[Symbol.asyncIterator]() {
      for (const name of names) yield { name: `models/${name}`, supportedActions: ['generateContent'] };
    },
  }));
  return { client: { models: { generateContent, list } } as unknown as GenAiClient, calls, generateContent, list };
}

/** A Map-backed stand-in for the Redis client. */
function memoryKv() {
  const data = new Map<string, string>();
  return {
    data,
    kv: {
      get: vi.fn(async (key: string) => data.get(key) ?? null),
      set: vi.fn(async (key: string, value: string) => {
        data.set(key, value);
        return 'OK';
      }),
    },
  };
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('pcmToWav', () => {
  it('writes a 44-byte PCM WAV header followed by the samples', () => {
    const wav = pcmToWav(PCM, 24_000);
    const view = new DataView(wav.buffer);

    expect(wav.length).toBe(44 + PCM.length);
    expect(ascii(wav, 0, 4)).toBe('RIFF');
    expect(view.getUint32(4, true)).toBe(36 + PCM.length);
    expect(ascii(wav, 8, 4)).toBe('WAVE');
    expect(ascii(wav, 12, 4)).toBe('fmt ');
    expect(view.getUint32(16, true)).toBe(16);
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(24_000);
    expect(view.getUint32(28, true)).toBe(48_000); // byte rate
    expect(view.getUint16(32, true)).toBe(2); // block align
    expect(view.getUint16(34, true)).toBe(16);
    expect(ascii(wav, 36, 4)).toBe('data');
    expect(view.getUint32(40, true)).toBe(PCM.length);
    expect(Array.from(wav.slice(44))).toEqual(Array.from(PCM));
  });
});

describe('stripProvenance', () => {
  const tag = (s: string) => Array.from(s).map((c) => c.charCodeAt(0));

  it('cuts the C2PA manifest Gemini appends, so it is not played as static', () => {
    const audio = [1, 2, 3, 4, 5, 6];
    const manifest = [0, 0, 0, 40, ...tag('jumb'), 0, 0, 0, 30, ...tag('jumd'), ...tag('c2pa')];
    expect([...stripProvenance(new Uint8Array([...audio, ...manifest]))]).toEqual(audio);
  });

  it('also cuts the C2PA chunk header in front of the manifest', () => {
    const audio = [1, 2, 3, 4];
    const trailer = [...tag('C2PA'), 0x20, 0, 0, 0, 0, 0, 0, 0x20, ...tag('jumb'), 0, 0, 0, 9, ...tag('jumd')];
    expect([...stripProvenance(new Uint8Array([...audio, ...trailer]))]).toEqual(audio);
  });

  it('leaves audio without a manifest unchanged', () => {
    const pcm = new Uint8Array([...tag('jumb'), 9, 9, 9, 9, 1, 2]);
    expect(stripProvenance(pcm)).toBe(pcm);
  });
});

describe('createTts', () => {
  it('synthesizes Hindi with a flash TTS model, the Kore voice and a WAV result', async () => {
    const { client, calls } = fakeTtsClient();
    const tts = createTts({ client });

    const out = await tts.synthesize('नमस्ते दुनिया', 'hi');

    expect(out).not.toBeNull();
    expect(ascii(out!.wav, 0, 4)).toBe('RIFF');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.model).toBe('gemini-3.1-flash-tts-preview');
    expect(calls[0]?.config.responseModalities).toEqual(['AUDIO']);
    expect(calls[0]?.config.speechConfig).toEqual({ voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } });
    const prompt = JSON.stringify(calls[0]?.contents);
    // Only the words: a TTS model reads any instruction aloud along with them.
    expect(calls[0]?.contents).toEqual([{ role: 'user', parts: [{ text: 'नमस्ते दुनिया' }] }]);
    expect(prompt).not.toMatch(/read|aloud|hindi/i);
  });

  it('uses GEMINI_TTS_MODEL without listing models', async () => {
    const { client, list, calls } = fakeTtsClient();
    const out = await createTts({ client, model: 'custom-tts-model' }).synthesize('Hello', 'en');

    expect(out).not.toBeNull();
    expect(list).not.toHaveBeenCalled();
    expect(calls[0]?.model).toBe('custom-tts-model');
  });

  it('returns null when no model can speak', async () => {
    const { client, generateContent } = fakeTtsClient({ names: ['gemini-3.8-flash'] });
    expect(await createTts({ client }).synthesize('Hello', 'en')).toBeNull();
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('returns null without a Gemini client', async () => {
    expect(await createTts({ client: null }).synthesize('Hello', 'en')).toBeNull();
  });

  it('returns null for empty or over-long text, without calling the API', async () => {
    const { client, generateContent } = fakeTtsClient();
    const tts = createTts({ client });
    expect(await tts.synthesize('   ', 'en')).toBeNull();
    expect(await tts.synthesize('a'.repeat(TTS_MAX_CHARS + 1), 'en')).toBeNull();
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('serves a repeat from the in-memory cache without another API call', async () => {
    const { client, generateContent } = fakeTtsClient();
    const tts = createTts({ client });

    const first = await tts.synthesize('Stop work now', 'en');
    const second = await tts.synthesize('Stop work now', 'en');

    expect(second).toEqual(first);
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('caches in the shared store under a fs:tts: key, and reads it back without the API', async () => {
    const store = memoryKv();
    const first = fakeTtsClient();
    const firstOut = await createTts({ client: first.client, kv: store.kv as unknown as KvClient }).synthesize('Stop work now', 'ta');

    const keys = [...store.data.keys()];
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^fs:tts:[0-9a-f]{64}$/);
    expect(store.data.get(keys[0]!)).toBe(Buffer.from(firstOut!.wav).toString('base64'));

    const second = fakeTtsClient();
    const secondOut = await createTts({ client: second.client, kv: store.kv as unknown as KvClient }).synthesize('Stop work now', 'ta');
    expect(second.generateContent).not.toHaveBeenCalled();
    expect(secondOut).toEqual(firstOut);
  });

  it('keeps audio too large for the shared store in memory instead', async () => {
    const store = memoryKv();
    const big = new Uint8Array(900_000);
    const { client, generateContent } = fakeTtsClient();
    // Make the answer large enough that its base64 form exceeds the store limit.
    (client.models.generateContent as unknown as { mockImplementationOnce: (fn: () => unknown) => void }).mockImplementationOnce(
      async () => ({
        candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;rate=24000', data: Buffer.from(big).toString('base64') } }] } }],
      }),
    );
    const tts = createTts({ client, kv: store.kv as unknown as KvClient });

    await tts.synthesize('A long announcement', 'en');
    await tts.synthesize('A long announcement', 'en');

    expect(store.data.size).toBe(0);
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('returns null when the API fails, and never logs the text', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { client } = fakeTtsClient({ fail: true });

    expect(await createTts({ client }).synthesize('Secret worker text', 'hi')).toBeNull();

    const logged = warn.mock.calls.map((args) => args.map(String).join(' ')).join('\n');
    expect(logged).not.toContain('Secret worker text');
  });

  it('returns null when the response carries no audio', async () => {
    const { client } = fakeTtsClient({ audio: false });
    expect(await createTts({ client }).synthesize('Hello', 'en')).toBeNull();
  });
});
