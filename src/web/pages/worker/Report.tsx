import { useEffect, useRef, useState } from 'preact/hooks';
import { LanguageNudge } from '../../components/LanguageNudge';
import type { CreateReportRequest, CreateReportResponse, Me } from '../../../shared/api';
import { INDUSTRIES } from '../../../shared/industries';
import { api } from '../../api';
import { Banner } from '../../components/Banner';
import { Icon, type IconName } from '../../components/Icon';
import { SpeakButton } from '../../components/SpeakButton';
import { copyText } from '../../clipboard';
import { storeReporterKey } from '../../reporterKeys';
import { DEMO_REPORTS } from '../../../shared/demoReports';
import { t, type TKey, useLang } from '../../i18n';
import { navigate } from '../../router';
import { canRecord, type Clip, recordAudio, type Recording } from '../../speech';

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

/**
 * Voice note capture. The recorder reports its end (stop, time limit or error) through onFinished, so the
 * recording state and the clip stay correct without polling. Leaving the page releases the microphone.
 */
function useVoiceNote(setError: (message: string | null) => void) {
  const [recording, setRecording] = useState(false);
  const [audio, setAudio] = useState<Clip | null>(null);
  const handle = useRef<Recording | null>(null);
  const request = useRef<AbortController | null>(null);

  function finished(clip: Clip | null) {
    handle.current = null;
    request.current = null;
    setRecording(false);
    if (clip) setAudio(clip);
    else setError(t('report.voiceUnsupported'));
  }

  async function startVoice() {
    if (handle.current) return;
    setError(null);
    const controller = new AbortController();
    request.current = controller;
    try {
      const rec = await recordAudio({ signal: controller.signal, onFinished: finished });
      // The page may have left while the permission prompt was open; the mic must not stay on.
      if (controller.signal.aborted) {
        rec.cancel();
        return;
      }
      handle.current = rec;
      setRecording(true);
    } catch {
      if (controller.signal.aborted) return;
      request.current = null;
      setError(t('report.voiceUnsupported'));
    }
  }

  function stopVoice() {
    handle.current?.stop();
  }

  useEffect(() => {
    return () => {
      request.current?.abort();
      handle.current?.cancel();
      handle.current = null;
      request.current = null;
    };
  }, []);

  return { recording, audio, clearAudio: () => setAudio(null), startVoice, stopVoice };
}

function CategoryPicker({
  categories,
  category,
  onChange,
}: {
  categories: readonly string[];
  category: string | null;
  onChange: (code: string | null) => void;
}) {
  return (
    <fieldset class="stack">
      <legend>{t('report.whatWrong')}</legend>
      <div class="choice-grid">
        {categories.map((code) => (
          <button key={code} type="button" class="choice" aria-pressed={category === code} onClick={() => onChange(code)}>
            <Icon name={CATEGORY_ICON[code] ?? 'alert'} size={24} />
            <span>{t(`hazard.${code}` as TKey)}</span>
          </button>
        ))}
        <button type="button" class="choice" aria-pressed={category === null} onClick={() => onChange(null)}>
          <Icon name="help" size={24} />
          <span>{t('report.notSure')}</span>
        </button>
      </div>
    </fieldset>
  );
}

function VoicePanel({
  recording,
  hasClip,
  onStart,
  onStop,
}: {
  recording: boolean;
  hasClip: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  return (
    <div class="voice">
      <button
        type="button"
        class={`mic-btn${recording ? ' is-recording' : ''}`}
        aria-label={recording ? t('report.voiceStop') : t('report.voiceStart')}
        onClick={() => (recording ? onStop() : onStart())}
      >
        <Icon name={recording ? 'stop' : 'mic'} size={40} />
      </button>
      <div class="row">
        <span class="muted">{recording ? t('report.voiceStop') : t('report.voiceStart')}</span>
        <SpeakButton text={recording ? t('report.voiceStop') : t('report.voiceStart')} />
      </div>
      {recording ? <p class="muted">{t('report.voiceLimit')}</p> : null}
      {hasClip && !recording ? <p role="status">{t('report.voiceRecorded')}</p> : null}
    </div>
  );
}

/** Confirmation after a report is sent: the case code, a copy button, and the way to track it. */
function ReportSent({ result, onAnother }: { result: CreateReportResponse; onAnother: () => void }) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // The form is replaced by this screen, so move focus here for screen reader users.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  async function copyCode() {
    setCopied(await copyText(result.caseCode));
  }

  async function copyPrivateKey() {
    const ok = await copyText(result.reporterToken);
    setCopied(ok);
    setCopyFailed(!ok);
  }

  return (
    <section class="card stack" aria-labelledby="sent-title">
      <h1 id="sent-title" ref={headingRef} tabIndex={-1}>
        {t('report.received')}
      </h1>
      <div class="ticket">
        <p>{t('report.caseCode')}</p>
        <p class="case-code" aria-label={result.caseCode}>
          {result.caseCode}
        </p>
        <div class="row">
          <button type="button" class="btn btn-primary" onClick={() => void copyCode()}>
            <Icon name="copy" size={20} />
            {t('report.copyCode')}
          </button>
          {copied ? <span role="status">{t('common.copied')}</span> : null}
        </div>
      </div>
      <Banner tone="warn"><p>{t('report.saveCode')}</p></Banner>
      <Banner tone="warn"><p>{t('closure.saveSecret')}</p><label class="sr-only" for="private-report-key">{t('closure.secretLabel')}</label><input id="private-report-key" class="reporter-key" readonly value={result.reporterToken} /><button type="button" class="btn" onClick={() => void copyPrivateKey()}>{t('closure.copySecret')}</button>{copied ? <span role="status">{t('common.copied')}</span> : null}{copyFailed ? <span role="status">{t('closure.copyManually')}</span> : null}</Banner>
      <div class="row">
        <SpeakButton text={`${t('report.received')} ${t('report.saveCode')}`} />
      </div>
      <div class="row">
        <button type="button" class="btn" onClick={() => navigate(`/track?code=${encodeURIComponent(result.caseCode)}`)}>
          <Icon name="track" size={20} />
          {t('report.track')}
        </button>
        <button type="button" class="btn" onClick={onAnother}>
          {t('report.another')}
        </button>
      </div>
    </section>
  );
}

export default function Report({ me }: { me: Me }) {
  const lang = useLang();
  const categories = INDUSTRIES[me.site.industry].hazardCategories;
  const [category, setCategory] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateReportResponse | null>(null);
  const note = useVoiceNote(setError);
  const voice = canRecord();

  async function submit(event: Event) {
    event.preventDefault();
    const body = text.trim();
    if (!body && !note.audio) {
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
      audioBase64: note.audio?.base64,
      audioMime: note.audio?.mime,
    };
    try {
      const res = await api.post<CreateReportResponse>('/api/reports', payload);
      setResult(res);
      storeReporterKey(res.caseCode, res.reporterToken);
      setText('');
      note.clearAudio();
    } catch {
      setError(t('report.failed'));
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <ReportSent
        result={result}
        onAnother={() => {
          setResult(null);
          setCategory(null);
        }}
      />
    );
  }

  return (
    <form class="stack worker-report" onSubmit={(event) => void submit(event)} aria-labelledby="report-title">
      <h1 id="report-title">{t('report.title')}</h1>
      <a class="report-track" href="#/track"><Icon name="track" size={20} />{t('report.trackExisting')}</a>
      <details class="privacy-note">
        <summary><Icon name="shield" size={20} />{t('report.privacyTitle')}</summary>
        <p>{t('report.anonymous')}</p>
        <SpeakButton text={t('report.anonymous')} />
      </details>

      <div class="field">
        <label class="field-label" for="report-text">
          {t('report.describe')}
        </label>
        <textarea
          id="report-text"
          rows={5}
          placeholder={t('report.placeholder')}
          value={text}
          onInput={(event) => setText((event.currentTarget).value)}
        />
        <button type="button" class="btn btn-ghost btn-small example-btn" onClick={() => setText(DEMO_REPORTS[me.site.industry].text[lang])}>
          {t('report.example')}
        </button>
        <LanguageNudge text={text} />
      </div>

      {voice ? (
        <VoicePanel
          recording={note.recording}
          hasClip={note.audio !== null}
          onStart={() => void note.startVoice()}
          onStop={note.stopVoice}
        />
      ) : null}

      <details class="card category-picker">
        <summary>{t('report.categoryOptional', { category: category ? t(`hazard.${category}` as TKey) : t('report.notSure') })}</summary>
        <CategoryPicker categories={categories} category={category} onChange={setCategory} />
      </details>

      {error ? <Banner tone="danger">{error}</Banner> : null}

      <button type="submit" class="btn btn-primary btn-block" disabled={busy || note.recording}>
        <Icon name="send" size={20} />
        {busy ? t('common.submitting') : t('report.submit')}
      </button>
      {busy ? <SendingProgress /> : null}
    </form>
  );
}

/** Seconds after which each progress message appears. Sorting by AI can take up to ~20 s. */
const PROGRESS_STEPS: { after: number; key: TKey }[] = [
  { after: 0, key: 'report.progress.sending' },
  { after: 3, key: 'report.progress.sorting' },
  { after: 10, key: 'report.progress.almost' },
];

/** Reassures the reporter while the server translates and sorts the report, which can be slow. */
function SendingProgress() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 500);
    return () => clearInterval(timer);
  }, []);
  const key = [...PROGRESS_STEPS].reverse().find((s) => elapsed >= s.after)?.key ?? 'report.progress.sending';
  return (
    <div class="send-progress" role="status" aria-live="polite">
      <span class="send-progress-spinner" aria-hidden="true" />
      <span>{t(key)}</span>
    </div>
  );
}
