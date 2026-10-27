// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Report from '../../src/web/pages/worker/Report';
import { setLang } from '../../src/web/i18n';
import { mockFetch, worker } from './helpers';

/** Fake recorder: stop() fires the data and stop events synchronously, like a real recorder finishing. */
class FakeRecorder {
  static instances: FakeRecorder[] = [];
  static isTypeSupported(): boolean {
    return true;
  }
  state: 'inactive' | 'recording' = 'inactive';
  mimeType = 'audio/webm';
  started = false;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(
    public stream: unknown,
    public options?: unknown,
  ) {
    FakeRecorder.instances.push(this);
  }
  start(): void {
    this.state = 'recording';
    this.started = true;
  }
  stop(): void {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['voice'], { type: 'audio/webm' }) });
    this.onstop?.();
  }
}

interface FakeStream {
  tracks: { stop: ReturnType<typeof vi.fn> }[];
  getTracks: () => FakeStream['tracks'];
}

function fakeStream(): FakeStream {
  const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }];
  return { tracks, getTracks: () => tracks };
}

let getUserMedia: ReturnType<typeof vi.fn>;

beforeEach(() => {
  setLang('en');
  FakeRecorder.instances = [];
  getUserMedia = vi.fn();
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'mediaDevices');
});

/** Preact runs passive effect cleanups after paint (at most ~100 ms later), so wait past that. */
async function afterPaint(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 150));
  });
}

/** Lets pending promises (permission, FileReader) settle. */
async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setImmediate(resolve));
  });
}

function startButton() {
  return screen.getByRole('button', { name: 'Record my voice' });
}

describe('report voice note', () => {
  it('stops every microphone track when the page unmounts while recording', async () => {
    const stream = fakeStream();
    getUserMedia.mockResolvedValue(stream);
    render(<Report me={worker} />);
    await flush(); // let mount effects run, as they do in the browser

    fireEvent.click(startButton());
    await screen.findByRole('button', { name: 'Stop recording' });
    expect(FakeRecorder.instances[0]?.started).toBe(true);

    cleanup();
    await afterPaint();
    expect(stream.tracks.every((track) => track.stop.mock.calls.length > 0)).toBe(true);
  });

  it('resets recording and hands the clip back when the 60 s limit ends the recording', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const fetchMock = mockFetch({ '/api/reports': { caseCode: 'AAAA-1111', category: 'other', severity: 'low' } });
    getUserMedia.mockResolvedValue(fakeStream());
    render(<Report me={worker} />);

    fireEvent.click(startButton());
    await flush();
    expect(screen.getByRole('button', { name: 'Stop recording' })).toBeTruthy();
    const submit = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Send report' });
    expect(submit().disabled).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Record my voice' })).toBeTruthy());
    await vi.waitFor(() => expect(submit().disabled).toBe(false));

    fireEvent.submit(submit().closest('form')!);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/reports', expect.anything()));
    const call = fetchMock.mock.calls.find(([url]) => url === '/api/reports');
    expect(call).toBeTruthy();
    const init = call![1]!;
    const body = JSON.parse(init.body as string) as { audioBase64?: string; audioMime?: string };
    expect(body.audioBase64).toBe(btoa('voice'));
    expect(body.audioMime).toBe('audio/webm');
  });

  it('stops a permission grant that arrives after the page has unmounted', async () => {
    let grant: (stream: FakeStream) => void = () => undefined;
    getUserMedia.mockReturnValue(new Promise<FakeStream>((resolve) => (grant = resolve)));
    const { unmount } = render(<Report me={worker} />);
    await flush();

    fireEvent.click(startButton());
    unmount();
    await afterPaint();
    const late = fakeStream();
    grant(late);
    await flush();

    expect(late.tracks.every((track) => track.stop.mock.calls.length > 0)).toBe(true);
    expect(FakeRecorder.instances.every((recorder) => !recorder.started)).toBe(true);
  });
});

describe('report success focus', () => {
  it('moves focus to the success heading and shows the case code', async () => {
    mockFetch({ '/api/reports': { caseCode: 'AAAA-1111', category: 'other', severity: 'low' } });
    render(<Report me={worker} />);

    fireEvent.input(screen.getByLabelText('Describe the problem'), { target: { value: 'Loose wiring near the lift' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Send report' }).closest('form')!);

    const heading = await screen.findByRole('heading', { name: 'Your report was received.' });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(screen.getByText('AAAA-1111')).toBeTruthy();
  });
});
