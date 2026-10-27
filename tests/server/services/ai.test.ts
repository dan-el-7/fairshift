import { afterEach, describe, expect, it, vi } from 'vitest';
import { INDUSTRIES } from '../../../src/shared/industries';
import {
  AI_TIMEOUT_MS,
  AudioUnavailableError,
  createReportAi,
  heuristicAi,
  type AiAnalyseInput,
  type GenAiClient,
} from '../../../src/server/services/ai';

const ctorSpy = vi.hoisted(() => vi.fn());
vi.mock('@google/genai', () => ({
  ThinkingLevel: { LOW: 'LOW' },
  GoogleGenAI: class {
    models = { generateContent: async () => ({ text: '{}' }) };
    constructor(options: unknown) {
      ctorSpy(options);
    }
  },
}));

const CFG = INDUSTRIES.construction;

const textInput = (text: string): AiAnalyseInput => ({ text, language: 'en', cfg: CFG });

/** A fake SDK client whose generateContent answers with `respond`. */
function fakeClient(respond: () => Promise<unknown>): GenAiClient {
  return { models: { generateContent: vi.fn(respond) } } as unknown as GenAiClient;
}

/** Answers with the given text, as the SDK does (response.text). */
const answer = (text: string) => (): Promise<unknown> => Promise.resolve({ text });

const VALID = JSON.stringify({
  text: 'Sparks from the socket. Call Ravi on 98765 43210.',
  textEn: 'Sparks from the socket. Call Ravi on 98765 43210.',
  category: 'electrical',
  severity: 'high',
});

afterEach(() => {
  vi.useRealTimers();
  ctorSpy.mockClear();
});

describe('report AI with a Gemini client', () => {
  it('uses a valid JSON answer and masks the phone number', async () => {
    const client = fakeClient(answer(VALID));
    const ai = createReportAi({ client, geminiModel: 'test-model' });

    const result = await ai.analyse(textInput('Sparks from the socket'));

    expect(result.category).toBe('electrical');
    expect(result.severity).toBe('high');
    expect(result.text).toContain('[redacted]');
    expect(result.text).not.toContain('98765 43210');
    expect(result.textEn).not.toContain('98765 43210');
    const call = (client.models.generateContent as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(call?.model).toBe('test-model');
  });

  it('maps a category outside the industry list to other', async () => {
    const client = fakeClient(
      answer(JSON.stringify({ text: 'A strange thing', textEn: 'A strange thing', category: 'alien_attack', severity: 'low' })),
    );
    const result = await createReportAi({ client }).analyse(textInput('A strange thing'));
    expect(result.category).toBe('other');
    expect(result.severity).toBe('low');
  });

  it('falls back to the heuristic when the client throws', async () => {
    const client = fakeClient(() => Promise.reject(new Error('upstream 500')));
    const input = textInput('Sparks came from the socket');
    expect(await createReportAi({ client }).analyse(input)).toEqual(await heuristicAi().analyse(input));
  });

  it('falls back to the heuristic on malformed JSON', async () => {
    const client = fakeClient(answer('this is not json {'));
    const input = textInput('A fall from the roof');
    expect(await createReportAi({ client }).analyse(input)).toEqual(await heuristicAi().analyse(input));
  });

  it('falls back to the heuristic when the model does not answer within the timeout', async () => {
    vi.useFakeTimers();
    const client = fakeClient(() => new Promise<never>(() => undefined));
    const input = textInput('Water supply stopped in the heat');
    const pending = createReportAi({ client }).analyse(input);

    await vi.advanceTimersByTimeAsync(AI_TIMEOUT_MS + 1);

    expect(await pending).toEqual(await heuristicAi().analyse(input));
  });

  it('still rejects audio with AudioUnavailableError when the model fails', async () => {
    const client = fakeClient(() => Promise.reject(new Error('down')));
    const audio: AiAnalyseInput = { audioBase64: 'AAAA', audioMime: 'audio/webm', language: 'hi', cfg: CFG };
    await expect(createReportAi({ client }).analyse(audio)).rejects.toBeInstanceOf(AudioUnavailableError);
  });
});

describe('report AI without any AI service', () => {
  it('rejects audio reports with AudioUnavailableError', async () => {
    const audio: AiAnalyseInput = { audioBase64: 'AAAA', audioMime: 'audio/webm', language: 'en', cfg: CFG };
    await expect(createReportAi({}).analyse(audio)).rejects.toBeInstanceOf(AudioUnavailableError);
  });

  it('uses the keyword heuristic for text', async () => {
    const result = await createReportAi({}).analyse(textInput('The wiring sparks near the socket'));
    expect(result.category).toBe('electrical');
  });
});

describe('Gemini client selection', () => {
  it('uses a Gemini API key, and prefers it over Vertex AI', () => {
    createReportAi({ geminiApiKey: 'test-key-not-real', googleProject: 'demo-project' });
    expect(ctorSpy).toHaveBeenCalledTimes(1);
    expect(ctorSpy).toHaveBeenCalledWith({ apiKey: 'test-key-not-real' });
  });

  it('uses Vertex AI when only a project is set', () => {
    createReportAi({ googleProject: 'demo-project', googleLocation: 'asia-south1' });
    expect(ctorSpy).toHaveBeenCalledWith({ vertexai: true, project: 'demo-project', location: 'asia-south1' });
  });

  it('builds no client without credentials', () => {
    createReportAi({});
    expect(ctorSpy).not.toHaveBeenCalled();
  });
});
