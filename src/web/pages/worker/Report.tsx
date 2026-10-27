import { useState } from 'preact/hooks';
import type { CreateReportRequest, CreateReportResponse, Me } from '../../../shared/api';
import { INDUSTRIES } from '../../../shared/industries';
import { api } from '../../api';
import { Banner } from '../../components/Banner';
import { Icon } from '../../components/Icon';
import { SpeakButton } from '../../components/SpeakButton';
import { copyText } from '../../clipboard';
import { t, type TKey, useLang } from '../../i18n';
import { navigate } from '../../router';
import { canRecord, recordAudio, type Recording } from '../../speech';

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
        <p>{t('report.caseCode')}</p>
        <p class="case-code" aria-label={result.caseCode}>
          {result.caseCode}
        </p>
        <div class="row">
          <button
            type="button"
            class="btn btn-primary"
            onClick={async () => setCopied(await copyText(result.caseCode))}
          >
            <Icon name="copy" size={22} />
            {t('report.copyCode')}
          </button>
          {copied ? <span role="status">{t('common.copied')}</span> : null}
        </div>
        <Banner tone="warn">
          <p>{t('report.saveCode')}</p>
        </Banner>
        <div class="row">
          <SpeakButton text={`${t('report.received')} ${t('report.saveCode')}`} />
        </div>
        <div class="row">
          <button type="button" class="btn" onClick={() => navigate(`/track?code=${encodeURIComponent(result.caseCode)}`)}>
            <Icon name="track" size={22} />
            {t('report.track')}
          </button>
        </div>
        <div class="row">
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

  return (
    <form class="stack" onSubmit={submit} aria-labelledby="report-title">
      <h1 id="report-title">{t('report.title')}</h1>
      <Banner tone="info">
        <p>{t('report.anonymous')}</p>
      </Banner>
      <div class="row">
        <SpeakButton text={t('report.anonymous')} />
      </div>

      <fieldset class="stack">
        <legend class="field-label">{t('report.whatWrong')}</legend>
        <div class="chips">
          {categories.map((code) => (
            <button
              key={code}
              type="button"
              class="chip"
              aria-pressed={category === code}
              onClick={() => setCategory(code)}
            >
              {t(`hazard.${code}` as TKey)}
            </button>
          ))}
          <button type="button" class="chip" aria-pressed={category === null} onClick={() => setCategory(null)}>
            {t('report.notSure')}
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
      </div>

      {voice ? (
        <div class="stack">
          <div class="row">
            {recording ? (
              <button type="button" class="btn" onClick={() => void stopVoice()}>
                <Icon name="stop" size={22} />
                {t('report.voiceStop')}
              </button>
            ) : (
              <button type="button" class="btn" onClick={() => void startVoice()}>
                <Icon name="mic" size={22} />
                {t('report.voiceStart')}
              </button>
            )}
            <SpeakButton text={recording ? t('report.voiceStop') : t('report.voiceStart')} />
          </div>
          {recording ? <p class="muted">{t('report.voiceLimit')}</p> : null}
          {audio && !recording ? <p role="status">{t('report.voiceRecorded')}</p> : null}
        </div>
      ) : null}

      {error ? <Banner tone="danger">{error}</Banner> : null}

      <div class="row">
        <button type="submit" class="btn btn-primary btn-block" disabled={busy || recording !== null}>
          <Icon name="send" size={22} />
          {busy ? t('common.submitting') : t('report.submit')}
        </button>
      </div>
    </form>
  );
}
