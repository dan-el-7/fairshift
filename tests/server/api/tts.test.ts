import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../../src/server/app';
import type { AppConfig } from '../../../src/server/config';
import { generatePassportKeys } from '../../../src/server/domain/passport';
import type { Tts } from '../../../src/server/services/tts';
import { createMemoryRepo } from '../../../src/server/store/memory';
import { seedDemo } from '../../../src/server/store/seed';
import { fakeAi, NOW, SESSION_SECRET, json } from './harness';

const WAV = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3]); // "RIFF" plus bytes

/** An app with the given speech service (or none). Each call has its own rate-limit counters. */
async function ttsApp(tts: Tts | null) {
  const repo = createMemoryRepo();
  await seedDemo(repo, NOW, { feedbackPerSite: 0 });
  const keys = generatePassportKeys();
  const config: AppConfig = {
    sessionSecret: SESSION_SECRET,
    secureCookies: false,
    passport: { privateKey: keys.privateKey, publicKey: keys.publicKey, publicPem: keys.publicPem },
  };
  const app = createApp({ repo, ai: fakeAi, tts, config, now: () => new Date(NOW.getTime()) });
  return app;
}

function speak(app: Awaited<ReturnType<typeof ttsApp>>, body: unknown) {
  return app.request('/api/tts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const okTts = (): Tts & { synthesize: ReturnType<typeof vi.fn> } => ({
  synthesize: vi.fn(async () => ({ wav: WAV })),
});

describe('POST /api/tts', () => {
  it('returns WAV audio with a one-day private cache header', async () => {
    const tts = okTts();
    const app = await ttsApp(tts);

    const res = await speak(app, { text: '  नमस्ते  ', lang: 'hi' });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('audio/wav');
    expect(res.headers.get('cache-control')).toBe('private, max-age=86400');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(WAV);
    expect(tts.synthesize).toHaveBeenCalledWith('नमस्ते', 'hi');
  });

  it('answers 503 when no speech service is configured', async () => {
    const app = await ttsApp(null);
    const res = await speak(app, { text: 'Hello', lang: 'en' });
    expect(res.status).toBe(503);
    expect(await json<{ error: string }>(res)).toEqual({ error: 'speech unavailable' });
  });

  it('answers 503 when the speech service has no audio', async () => {
    const app = await ttsApp({ synthesize: async () => null });
    const res = await speak(app, { text: 'Hello', lang: 'en' });
    expect(res.status).toBe(503);
  });

  it('rejects text over 600 characters with 413', async () => {
    const tts = okTts();
    const app = await ttsApp(tts);
    const res = await speak(app, { text: 'a'.repeat(601), lang: 'en' });
    expect(res.status).toBe(413);
    expect(tts.synthesize).not.toHaveBeenCalled();
  });

  it('accepts exactly 600 characters', async () => {
    const app = await ttsApp(okTts());
    expect((await speak(app, { text: 'a'.repeat(600), lang: 'en' })).status).toBe(200);
  });

  it('rejects empty text and unknown languages with 400', async () => {
    const app = await ttsApp(okTts());
    expect((await speak(app, { text: '   ', lang: 'en' })).status).toBe(400);
    expect((await speak(app, { text: 'Hello', lang: 'fr' })).status).toBe(400);
    expect((await speak(app, { lang: 'en' })).status).toBe(400);
  });

  it('allows 30 requests per minute and then returns 429', async () => {
    const app = await ttsApp(okTts());
    for (let i = 0; i < 30; i++) {
      expect((await speak(app, { text: 'Hello', lang: 'en' })).status).toBe(200);
    }
    expect((await speak(app, { text: 'Hello', lang: 'en' })).status).toBe(429);
  });
});
