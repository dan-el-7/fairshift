import { useEffect, useState } from 'preact/hooks';
import { LanguageNudge } from '../../components/LanguageNudge';
import type { CreateReportRequest, CreateReportResponse, Me } from '../../../shared/api';
import { INDUSTRIES } from '../../../shared/industries';
import { api } from '../../api';
import { Banner } from '../../components/Banner';
import { Icon, type IconName } from '../../components/Icon';
import { SpeakButton } from '../../components/SpeakButton';
import { copyText } from '../../clipboard';
import { t, type TKey, useLang } from '../../i18n';
import { navigate } from '../../router';
import { canRecord, recordAudio, type Recording } from '../../speech';

/** A picture for each hazard category. Unknown categories get the generic alert icon. */
const CATEGORY_ICON: Partial<Record<string, IconName>> = {
  fall_height: 'hardhat',
  scaffolding: 'hardhat',
  electrical: 'bolt',
  heavy_machinery: 'alert',
  ppe_missing: 'shield',
  heat_stress: 'flame',
  harassment: 'user',
  wage_issue: 'pay',
  fire_safety: 'flame',
  workload: 'clock',
  other: 'help',
};

/** Three visible steps: 1 category, 2 describe, 3 done. Presentation only. */
function Steps({ current }: { current: 1 | 2 | 3 }) {
  const items: Array<{ key: TKey }> = [{ key: 'report.whatWrong' }, { key: 'report.describe' }, { key: 'report.caseCode' }];
  return (
    <ol class="steps" aria-label={t('report.title')}>
      {items.map((item, index) => {
        const n = index + 1;
        const state = n === current ? 'current' : n < current ? 'done' : undefined;
        return (
          <li
            key={item.key}
            class={state === 'done' ? 'is-done' : undefined}
            aria-current={state === 'current' ? 'step' : undefined}
          >
            <span class="step-num" aria-hidden="true">
              {n}
            </span>
            <span>{t(item.key)}</span>
          </li>
        );
      })}
    </ol>
  );
}

export default function Report({ me }: { me: Me }) {
  const lang = useLang();
  const categories = INDUSTRIES[me.site.industry].hazardCategories;
  const [category, setCategory] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [recording, setRecording] = useState<Recording | null>(null);
  const [audio, setAudio] = useState<{ base64: string; mime: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateReportResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const voice = canRecord();

  async function startVoice() {
    setError(null);
    try {
      setRecording(await recordAudio(60000));
    } catch {
      setError(t('report.voiceUnsupported'));
    }
  }

  async function stopVoice() {
    if (!recording) return;
    try {
      setAudio(await recording.stop());
    } catch {
      setError(t('report.voiceUnsupported'));
    } finally {
      setRecording(null);
    }
  }

  async function submit(event: Event) {
    event.preventDefault();
    const body = text.trim();
    if (!body && !audio) {
      setError(t('report.needInput'));
      return;
    }
    setBusy(true);
    setError(null);
    // Only the site, the UI language, the chosen category and the report content are sent.
    // No worker id, name, time or device details.
    const payload: CreateReportRequest = {
      siteId: me.site.id,
      language: lang,
      category: category ?? undefined,
      text: body || undefined,
      audioBase64: audio?.base64,
      audioMime: audio?.mime,
    };
    try {
      const res = await api.post<CreateReportResponse>('/api/reports', payload);
      setResult(res);
      setText('');
      setAudio(null);
    } catch {
      setError(t('report.failed'));
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <section class="card stack" aria-labelledby="sent-title">
        <h1 id="sent-title">{t('report.received')}</h1>
        <Steps current={3} />
        <div class="ticket">
          <p>{t('report.caseCode')}</p>
          <p class="case-code" aria-label={result.caseCode}>
            {result.caseCode}
          </p>
          <div class="row">
            <button type="button" class="btn btn-primary" onClick={async () => setCopied(await copyText(result.caseCode))}>
              <Icon name="copy" size={20} />
              {t('report.copyCode')}
            </button>
            {copied ? <span role="status">{t('common.copied')}</span> : null}
          </div>
        </div>
        <Banner tone="warn">
          <p>{t('report.saveCode')}</p>
        </Banner>
        <div class="row">
          <SpeakButton text={`${t('report.received')} ${t('report.saveCode')}`} />
        </div>
        <div class="row">
          <button type="button" class="btn" onClick={() => navigate(`/track?code=${encodeURIComponent(result.caseCode)}`)}>
            <Icon name="track" size={20} />
            {t('report.track')}
          </button>
          <button
            type="button"
            class="btn"
            onClick={() => {
              setResult(null);
              setCategory(null);
              setCopied(false);
            }}
          >
            {t('report.another')}
          </button>
        </div>
      </section>
    );
  }

  const step: 1 | 2 = category === null && !text.trim() && !audio ? 1 : 2;

  return (
    <form class="stack" onSubmit={submit} aria-labelledby="report-title">
      <h1 id="report-title">{t('report.title')}</h1>
      <Steps current={step} />

      <div class="notice-anon">
        <Icon name="shield" size={24} />
        <p>{t('report.anonymous')}</p>
      </div>
      <div class="row">
        <SpeakButton text={t('report.anonymous')} />
      </div>

      <fieldset class="stack">
        <legend>{t('report.whatWrong')}</legend>
        <div class="choice-grid">
          {categories.map((code) => (
            <button
              key={code}
              type="button"
              class="choice"
              aria-pressed={category === code}
              onClick={() => setCategory(code)}
            >
              <Icon name={CATEGORY_ICON[code] ?? 'alert'} size={24} />
              <span>{t(`hazard.${code}` as TKey)}</span>
            </button>
          ))}
          <button type="button" class="choice" aria-pressed={category === null} onClick={() => setCategory(null)}>
            <Icon name="help" size={24} />
            <span>{t('report.notSure')}</span>
          </button>
        </div>
      </fieldset>

      <div class="field">
        <label class="field-label" for="report-text">
          {t('report.describe')}
        </label>
        <textarea
          id="report-text"
          rows={5}
          placeholder={t('report.placeholder')}
          value={text}
          onInput={(event) => setText((event.currentTarget as HTMLTextAreaElement).value)}
        />
        <LanguageNudge text={text} />
      </div>

      {voice ? (
        <div class="voice">
          <button
            type="button"
            class={`mic-btn${recording ? ' is-recording' : ''}`}
            aria-label={recording ? t('report.voiceStop') : t('report.voiceStart')}
            onClick={() => (recording ? void stopVoice() : void startVoice())}
          >
            <Icon name={recording ? 'stop' : 'mic'} size={40} />
          </button>
          <div class="row">
            <span class="muted">{recording ? t('report.voiceStop') : t('report.voiceStart')}</span>
            <SpeakButton text={recording ? t('report.voiceStop') : t('report.voiceStart')} />
          </div>
          {recording ? <p class="muted">{t('report.voiceLimit')}</p> : null}
          {audio && !recording ? <p role="status">{t('report.voiceRecorded')}</p> : null}
        </div>
      ) : null}

      {error ? <Banner tone="danger">{error}</Banner> : null}

      <button type="submit" class="btn btn-primary btn-block" disabled={busy || recording !== null}>
        <Icon name="send" size={20} />
        {busy ? t('common.submitting') : t('report.submit')}
      </button>
      {busy ? <SendingProgress /> : null}
    </form>
  );
}

/** Seconds after which each progress message appears. Sorting by AI can take up to ~20 s. */
const PROGRESS_STEPS: Array<{ after: number; key: TKey }> = [
  { after: 0, key: 'report.progress.sending' },
  { after: 3, key: 'report.progress.sorting' },
  { after: 10, key: 'report.progress.almost' },
];

/** Reassures the reporter while the server translates and sorts the report, which can be slow. */
function SendingProgress() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 500);
    return () => window.clearInterval(timer);
  }, []);
  const step = [...PROGRESS_STEPS].reverse().find((s) => elapsed >= s.after) ?? PROGRESS_STEPS[0]!;
  return (
    <div class="send-progress" role="status" aria-live="polite">
      <span class="send-progress-spinner" aria-hidden="true" />
      <span>{t(step.key)}</span>
    </div>
  );
}
