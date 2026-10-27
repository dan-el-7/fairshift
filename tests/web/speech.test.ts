// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canSpeak, speak } from '../../src/web/speech';

/** Minimal SpeechSynthesisUtterance: records the text, voice and language. */
class FakeUtterance {
  lang = '';
  voice: unknown = null;
  rate = 1;
  constructor(public text: string) {}
}

/** Minimal Audio: records the source and whether play was requested. */
class FakeAudio {
  static instances: FakeAudio[] = [];
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  play = vi.fn(async () => undefined);
  pause = vi.fn();
  constructor(public src: string) {
    FakeAudio.instances.push(this);
  }
}

const urlStatics = URL as unknown as { createObjectURL?: unknown; revokeObjectURL?: unknown };
const originalCreate = urlStatics.createObjectURL;
const originalRevoke = urlStatics.revokeObjectURL;

/** Installs a fake speechSynthesis with the given voices. */
function installSynth(voices: { lang: string; name: string }[]) {
  const synth = {
    getVoices: () => voices,
    speak: vi.fn(),
    cancel: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal('speechSynthesis', synth);
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  return synth;
}

/** Installs a fetch that answers the TTS endpoint with a WAV blob, or a failure. */
function installFetch(ok: boolean) {
  const fetchMock = vi.fn(async () => ({
    ok,
    blob: async () => new Blob(['RIFF'], { type: 'audio/wav' }),
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

let blobUrlCount = 0;

beforeEach(() => {
  FakeAudio.instances = [];
  vi.stubGlobal('Audio', FakeAudio);
  urlStatics.createObjectURL = vi.fn(() => `blob:fake-${++blobUrlCount}`);
  urlStatics.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
  urlStatics.createObjectURL = originalCreate;
  urlStatics.revokeObjectURL = originalRevoke;
});

describe('speak', () => {
  it('plays server audio for Hindi when the device has no Hindi voice', async () => {
    const synth = installSynth([{ lang: 'en-US', name: 'English' }]);
    const fetchMock = installFetch(true);

    speak('नमस्ते, आप कैसे हैं', 'hi');

    await vi.waitFor(() => expect(FakeAudio.instances).toHaveLength(1));
    expect(fetchMock).toHaveBeenCalledWith('/api/tts', expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({
      text: 'नमस्ते, आप कैसे हैं',
      lang: 'hi',
    });
    expect(FakeAudio.instances[0]?.src).toBe('blob:fake-1');
    expect(FakeAudio.instances[0]?.play).toHaveBeenCalled();
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it('uses the device voice when one matches the language', async () => {
    const synth = installSynth([
      { lang: 'en-US', name: 'English' },
      { lang: 'hi-IN', name: 'Hindi' },
    ]);
    const fetchMock = installFetch(true);

    speak('स्वागत है', 'hi');

    await vi.waitFor(() => expect(synth.speak).toHaveBeenCalledTimes(1));
    const utterance = synth.speak.mock.calls[0]?.[0] as unknown as FakeUtterance;
    expect(utterance.text).toBe('स्वागत है');
    expect(utterance.lang).toBe('hi-IN');
    expect(utterance.voice).toEqual({ lang: 'hi-IN', name: 'Hindi' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('for Tamil, stays silent when the server cannot speak, and never uses an English voice', async () => {
    const synth = installSynth([{ lang: 'en-US', name: 'English' }]);
    installFetch(false);

    speak('வணக்கம்', 'ta');

    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(synth.speak).not.toHaveBeenCalled();
    expect(FakeAudio.instances).toHaveLength(0);
  });

  it('for English, falls back to the device default voice when the server cannot speak', async () => {
    const synth = installSynth([{ lang: 'ta-IN', name: 'Tamil' }]);
    installFetch(false);

    speak('Stop work now', 'en');

    await vi.waitFor(() => expect(synth.speak).toHaveBeenCalledTimes(1));
    const utterance = synth.speak.mock.calls[0]?.[0] as unknown as FakeUtterance;
    expect(utterance.voice).toBeNull();
  });

  it('revokes the object URL once playback ends', async () => {
    installSynth([]);
    installFetch(true);

    speak('Ending soon', 'hi');
    await vi.waitFor(() => expect(FakeAudio.instances).toHaveLength(1));
    FakeAudio.instances[0]?.onended?.();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith(FakeAudio.instances[0]?.src);
  });

  it('reuses cached audio for the same language and text', async () => {
    installSynth([]);
    const fetchMock = installFetch(true);

    speak('Repeat this line', 'hi');
    await vi.waitFor(() => expect(FakeAudio.instances).toHaveLength(1));
    speak('Repeat this line', 'hi');
    await vi.waitFor(() => expect(FakeAudio.instances).toHaveLength(2));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('canSpeak', () => {
  it('is true when only server audio is available', () => {
    const original: unknown = Reflect.get(globalThis, 'speechSynthesis');
    Reflect.deleteProperty(globalThis, 'speechSynthesis');
    try {
      expect(canSpeak()).toBe(true);
    } finally {
      if (original !== undefined) Reflect.set(globalThis, 'speechSynthesis', original);
    }
  });
});
