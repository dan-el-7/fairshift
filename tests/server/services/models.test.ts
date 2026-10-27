import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GenAiClient } from '../../../src/server/services/ai';
import { listModelNames, textModelCandidates } from '../../../src/server/services/models';

/** An async-iterable stand-in for the SDK's Pager. */
function pagerOf(items: Record<string, unknown>[]) {
  return {
    async *[Symbol.asyncIterator]() {
      yield* items;
    },
  };
}

function listingClient(items: Record<string, unknown>[]) {
  const list = vi.fn(async () => pagerOf(items));
  return { client: { models: { list } } as unknown as GenAiClient, list };
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('listModelNames', () => {
  it('strips the models/ prefix and keeps models that support generateContent', async () => {
    const { client } = listingClient([
      { name: 'models/gemini-3.8-flash', supportedActions: ['generateContent', 'countTokens'] },
      { name: 'models/text-embedding-004', supportedActions: ['embedContent'] },
      { name: 'models/gemini-2.5-pro' },
    ]);
    expect(await listModelNames(client)).toEqual(['gemini-3.8-flash', 'gemini-2.5-pro']);
  });

  it('caches a successful listing for the client', async () => {
    const { client, list } = listingClient([{ name: 'models/gemini-3.8-flash' }]);
    await listModelNames(client);
    await listModelNames(client);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('resolves to [] when listing fails, and lists again next time', async () => {
    const list = vi
      .fn()
      .mockRejectedValueOnce(new Error('403 denied'))
      .mockResolvedValueOnce(pagerOf([{ name: 'models/gemini-3.8-flash' }]));
    const client = { models: { list } } as unknown as GenAiClient;

    expect(await listModelNames(client)).toEqual([]);
    expect(await listModelNames(client)).toEqual(['gemini-3.8-flash']);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('resolves to [] when the client has no list method', async () => {
    expect(await listModelNames({ models: {} } as unknown as GenAiClient)).toEqual([]);
  });
});

describe('textModelCandidates', () => {
  it('puts the configured model first and adds up to two lighter flash models', () => {
    const names = [
      'gemini-3.8-flash',
      'gemini-2.5-flash-lite',
      'gemini-3.1-flash',
      'gemini-3.5-flash-preview-tts',
      'gemini-live-flash',
      'gemini-2.0-flash-image',
      'text-embedding-flash',
      'gemini-3.5-pro',
    ];
    expect(textModelCandidates('gemini-3.8-flash', names)).toEqual([
      'gemini-3.8-flash',
      'gemini-2.5-flash-lite',
      'gemini-3.1-flash',
    ]);
  });

  it('without lite models, prefers the newest version', () => {
    const names = ['gemini-2.5-flash', 'gemini-3.0-flash', 'gemini-3.1-flash', 'gemini-3.8-flash'];
    expect(textModelCandidates('gemini-3.8-flash', names)).toEqual(['gemini-3.8-flash', 'gemini-3.1-flash', 'gemini-3.0-flash']);
  });

  it('de-duplicates and keeps the configured model when the listing is empty', () => {
    expect(textModelCandidates('gemini-3.8-flash', [])).toEqual(['gemini-3.8-flash']);
    expect(textModelCandidates('gemini-3.8-flash', ['gemini-3.8-flash', 'gemini-3.8-flash'])).toEqual(['gemini-3.8-flash']);
  });
});
