import { Hono } from 'hono';
import { z } from 'zod';
import type { Deps } from '../app';
import type { AppEnv } from '../middleware/auth';
import { TTS_MAX_CHARS } from '../services/tts';
import { parseBody } from './http';

const speakSchema = z.object({
  text: z.string().trim().min(1),
  lang: z.enum(['en', 'hi', 'ta']),
});

/**
 * Server-side read-aloud for languages the device may lack a voice for. Public, like the rest of
 * the reporting pages. The text is not logged or stored, apart from the audio cache.
 */
export function ttsRoutes(deps: Deps): Hono<AppEnv> {
  const api = new Hono<AppEnv>();

  api.post('/tts', async (c) => {
    const body = await parseBody(c, speakSchema);
    if (body instanceof Response) return body;
    if (body.text.length > TTS_MAX_CHARS) return c.json({ error: 'text too long' }, 413);
    if (!deps.tts) return c.json({ error: 'speech unavailable' }, 503);

    const audio = await deps.tts.synthesize(body.text, body.lang);
    if (!audio) return c.json({ error: 'speech unavailable' }, 503);

    return c.body(new Uint8Array(audio.wav), 200, {
      'Content-Type': 'audio/wav',
      'Cache-Control': 'private, max-age=86400',
    });
  });

  return api;
}
