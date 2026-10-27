import { afterEach, describe, expect, it, vi } from 'vitest';
import { INDUSTRIES } from '../../../src/shared/industries';
import { createReportAi, geminiAi, heuristicAi, type AiAnalyseInput, type GenAiClient } from '../../../src/server/services/ai';

vi.mock('@google/genai', () => ({
  ThinkingLevel: { LOW: 'LOW' },
  GoogleGenAI: class {
    models = { generateContent: async () => ({ text: '{}' }) };
  },
}));

const CFG = INDUSTRIES.construction;
const input: AiAnalyseInput = { text: 'Sparks from the socket', language: 'en', cfg: CFG };
const VALID = JSON.stringify({ text: 'Sparks from the socket.', textEn: 'Sparks from the socket.', category: 'electrical', severity: 'high' });

interface Call {
  model: string;
  config: Record<string, unknown>;
}

/**
 * A fake client. `respond` decides per model and call. `names` is the model listing; `list: false`
 * makes the listing throw.
 */
function fakeGemini(
  respond: (model: string, calls: Call[]) => Promise<unknown>,
  options: { names?: string[]; list?: boolean } = {},
) {
  const calls: Call[] = [];
  const generateContent = vi.fn(async (params: { model: string; config: Record<string, unknown> }) => {
    calls.push({ model: params.model, config: params.config });
    return respond(params.model, calls);
  });
  const list = vi.fn(async () => {
    if (options.list === false) throw new Error('listing denied');
    const items = (options.names ?? []).map((name) => ({ name: `models/${name}` }));
    return {
      async *[Symbol.asyncIterator]() {
        yield* items;
      },
    };
  });
  const client = { models: { generateContent, list } } as unknown as GenAiClient;
  return { client, calls };
}

/** An SDK-shaped error: the HTTP status on `status`, as ApiError has it. */
function apiError(status: number, message: string): Error {
  return Object.assign(new Error(message), { name: 'ApiError', status });
}

const answer = () => Promise.resolve({ text: VALID });

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('model fallback', () => {
  it('moves to a discovered model when the configured one is busy (503)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { client, calls } = fakeGemini(
      (model) => (model === 'gemini-3.8-flash' ? Promise.reject(apiError(503, 'high demand')) : answer()),
      { names: ['gemini-3.8-flash', 'gemini-2.5-flash-lite'] },
    );

    const result = await createReportAi({ client, geminiModel: 'gemini-3.8-flash' }).analyse(input);

    expect(result.category).toBe('electrical');
    expect(calls.map((c) => c.model)).toEqual(['gemini-3.8-flash', 'gemini-2.5-flash-lite']);
  });

  it('logs a line naming the model for each failed attempt', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { client } = fakeGemini(
      (model) => (model === 'gemini-3.8-flash' ? Promise.reject(apiError(504, 'deadline expired')) : answer()),
      { names: ['gemini-2.5-flash-lite'] },
    );

    await createReportAi({ client, geminiModel: 'gemini-3.8-flash' }).analyse(input);

    const lines = warn.mock.calls.map((args) => String(args[0]));
    expect(lines.some((line) => line.includes('gemini-3.8-flash'))).toBe(true);
  });

  it('moves on for a retired model (404)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { client, calls } = fakeGemini(
      (model) => (model === 'gemini-2.5-flash' ? Promise.reject(apiError(404, 'not found')) : answer()),
    );

    const result = await geminiAi({
      client,
      model: 'gemini-2.5-flash',
      listNames: async () => ['gemini-3.1-flash'],
    }).analyse(input);

    expect(result.severity).toBe('high');
    expect(calls.map((c) => c.model)).toEqual(['gemini-2.5-flash', 'gemini-3.1-flash']);
  });

  it('does not move on for other errors: the heuristic answers', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { client, calls } = fakeGemini(() => Promise.reject(apiError(400, 'bad request')), {
      names: ['gemini-2.5-flash-lite'],
    });

    const result = await createReportAi({ client, geminiModel: 'gemini-3.8-flash' }).analyse(input);

    expect(result).toEqual(await heuristicAi().analyse(input));
    expect(calls).toHaveLength(1);
  });

  it('does not move on for invalid output', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { client, calls } = fakeGemini(() => Promise.resolve({ text: 'not json' }), {
      names: ['gemini-2.5-flash-lite'],
    });

    const result = await createReportAi({ client, geminiModel: 'gemini-3.8-flash' }).analyse(input);

    expect(result).toEqual(await heuristicAi().analyse(input));
    expect(calls).toHaveLength(1);
  });

  it('when listing fails, only the configured model is tried', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { client, calls } = fakeGemini(() => Promise.reject(apiError(503, 'high demand')), { list: false });

    const result = await createReportAi({ client, geminiModel: 'gemini-3.8-flash' }).analyse(input);

    expect(result).toEqual(await heuristicAi().analyse(input));
    expect(calls.map((c) => c.model)).toEqual(['gemini-3.8-flash']);
  });

  it('respects the overall budget: no new attempt once less than 3 s is left', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { client, calls } = fakeGemini(
      (model) =>
        model === 'gemini-3.8-flash'
          ? new Promise((_, reject) => setTimeout(() => reject(apiError(503, 'busy')), 8_000))
          : new Promise<never>(() => undefined),
      { names: ['gemini-2.5-flash-lite', 'gemini-3.1-flash'] },
    );

    const outcome = geminiAi({
      client,
      model: 'gemini-3.8-flash',
      budgetMs: 12_000,
      listNames: async () => ['gemini-2.5-flash-lite', 'gemini-3.1-flash'],
    })
      .analyse(input)
      .then(
        () => 'answered',
        (err: unknown) => (err instanceof Error ? err.name : 'failed'),
      );
    await vi.advanceTimersByTimeAsync(12_000);

    expect(await outcome).toBe('TimeoutError');
    // The second model got the 4 s left after the first failed at 8 s. The third never started.
    expect(calls.map((c) => c.model)).toEqual(['gemini-3.8-flash', 'gemini-2.5-flash-lite']);
  });

  it('caps a hung first model so the lighter model still gets a turn', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { client, calls } = fakeGemini((model) => (model === 'gemini-3.8-flash' ? new Promise<never>(() => undefined) : answer()), {
      names: ['gemini-2.5-flash-lite'],
    });

    const pending = createReportAi({ client, geminiModel: 'gemini-3.8-flash' }).analyse(input);
    await vi.advanceTimersByTimeAsync(6_001);

    expect((await pending).category).toBe('electrical');
    expect(calls.map((c) => c.model)).toEqual(['gemini-3.8-flash', 'gemini-2.5-flash-lite']);
  });

  it('falls back to keyword triage when every model hangs past the budget', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { client } = fakeGemini(() => new Promise<never>(() => undefined), { names: ['gemini-2.5-flash-lite'] });

    const pending = createReportAi({ client, geminiModel: 'gemini-3.8-flash' }).analyse(input);
    await vi.advanceTimersByTimeAsync(15_001);

    expect(await pending).toEqual(await heuristicAi().analyse(input));
  });

  it('retries the same model once without thinkingConfig on a thinking-level 400', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { client, calls } = fakeGemini((_model, seen) =>
      seen.length === 1 ? Promise.reject(apiError(400, 'Thinking level is not supported by this model')) : answer(),
    );

    const result = await createReportAi({ client, geminiModel: 'gemini-3.8-flash' }).analyse(input);

    expect(result.category).toBe('electrical');
    expect(calls.map((c) => c.model)).toEqual(['gemini-3.8-flash', 'gemini-3.8-flash']);
    expect(calls[0]?.config.thinkingConfig).toEqual({ thinkingLevel: 'LOW' });
    expect(calls[1]?.config).not.toHaveProperty('thinkingConfig');
  });
});
