import { useEffect, useRef, useState } from 'preact/hooks';
import type { AttendanceMe, CheckInRequest, Me } from '../../../shared/api';
import type { Shift, ShiftWithSummary } from '../../../shared/types';
import { INDUSTRIES } from '../../../shared/industries';
import { ApiError, api, errorMessage } from '../../api';
import { Banner, type BannerTone } from '../../components/Banner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { Icon } from '../../components/Icon';
import { SpeakButton } from '../../components/SpeakButton';
import { Spinner } from '../../components/Spinner';
import { formatDay, formatTime, istDay, t } from '../../i18n';
import { useApiData } from '../../useApiData';

interface Detector {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
}
type DetectorCtor = new (options: { formats: string[] }) => Detector;

/** BarcodeDetector plus camera access, or null when this phone cannot scan. */
function scannerSupport(): DetectorCtor | null {
  const ctor = (globalThis as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
  if (typeof ctor !== 'function') return null;
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return null;
  return ctor;
}

/** The QR may hold the bare token or a link with ?token=. Accept both. */
function tokenFromScan(raw: string): string {
  const value = raw.trim();
  try {
    return new URL(value).searchParams.get('token') ?? value;
  } catch {
    return value;
  }
}

function currentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('no geolocation'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      reject,
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  });
}

function QrScanner({ onCode, onFail }: { onCode: (value: string) => void; onFail: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const Ctor = scannerSupport();
    const video = videoRef.current;
    if (!Ctor || !video) {
      onFail();
      return;
    }
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;

    const stopAll = () => {
      stopped = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then(async (media) => {
        if (stopped) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = media;
        video.srcObject = media;
        await video.play();
        const detector = new Ctor({ formats: ['qr_code'] });
        timer = setInterval(() => {
          detector
            .detect(video)
            .then((codes) => {
              const value = codes[0]?.rawValue;
              if (value && !stopped) {
                stopAll();
                onCode(value);
              }
            })
            .catch(() => undefined);
        }, 400);
      })
      .catch(() => {
        if (!stopped) onFail();
      });

    return stopAll;
  }, []);

  return <video ref={videoRef} class="scanner" playsInline muted autoPlay />;
}

export default function Attendance({ me }: { me: Me }) {
  const attendance = useApiData<AttendanceMe>('/api/attendance/me');
  const [scanning, setScanning] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: BannerTone; text: string } | null>(null);

  const config = INDUSTRIES[me.site.industry];
  const canScan = scannerSupport() !== null;
  const open = attendance.data?.open ?? null;

  function checkInError(err: unknown, byQr: boolean): string {
    if (err instanceof ApiError && err.status === 0) return errorMessage(err);
    if (byQr && err instanceof ApiError && err.status === 400) return t('attendance.invalidCode');
    return t('attendance.checkInFailed');
  }

  async function checkIn(body: CheckInRequest) {
    setBusy(true);
    setNotice(null);
    try {
      await api.post<Shift>('/api/attendance/check-in', body);
      setNotice({ tone: 'success', text: t('attendance.checkedIn') });
      attendance.reload();
    } catch (err) {
      setNotice({ tone: 'danger', text: checkInError(err, 'qrToken' in body) });
    } finally {
      setBusy(false);
    }
  }

  async function checkOut() {
    setBusy(true);
    setNotice(null);
    try {
      const shift = await api.post<ShiftWithSummary>('/api/attendance/check-out', {});
      setNotice({ tone: 'success', text: t('attendance.checkedOut', { hours: t('common.hours', { hours: shift.summary.hours }) }) });
      attendance.reload();
    } catch (err) {
      setNotice({ tone: 'danger', text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  async function checkInByLocation() {
    setNotice({ tone: 'info', text: t('attendance.locating') });
    let position: { lat: number; lng: number };
    try {
      position = await currentPosition();
    } catch {
      setNotice({ tone: 'danger', text: t('attendance.geoDenied') });
      return;
    }
    await checkIn(position);
  }

  const openText = open ? t('attendance.openSince', { time: formatTime(open.checkIn) }) : '';

  return (
    <div class="stack">
      <h1>{t('attendance.title')}</h1>

      {notice ? <Banner tone={notice.tone}>{notice.text}</Banner> : null}
      {attendance.error ? <ErrorMessage error={attendance.error} onRetry={attendance.reload} /> : null}
      {attendance.loading && !attendance.data ? <Spinner /> : null}

      {open ? (
        <section class="card stack" aria-labelledby="open-title">
          <p id="open-title" class="big">
            {openText}
          </p>
          <div class="row">
            <button type="button" class="btn btn-primary" disabled={busy} onClick={() => void checkOut()}>
              <Icon name="checkin" size={22} />
              {t('attendance.checkOut')}
            </button>
            <SpeakButton text={t('attendance.checkOut')} />
          </div>
        </section>
      ) : (
        <section class="card stack" aria-label={t('attendance.checkIn')}>
          {config.checkInModes.includes('qr') ? (
            <>
              {scanning ? (
                <div class="stack">
                  <QrScanner
                    onCode={(value) => {
                      setScanning(false);
                      void checkIn({ qrToken: tokenFromScan(value) });
                    }}
                    onFail={() => {
                      setScanning(false);
                      setNotice({ tone: 'warn', text: t('attendance.cameraDenied') });
                    }}
                  />
                  <p class="muted">{t('attendance.scanHint')}</p>
                  <div class="row">
                    <button type="button" class="btn" onClick={() => setScanning(false)}>
                      <Icon name="stop" size={22} />
                      {t('attendance.stopScan')}
                    </button>
                  </div>
                </div>
              ) : canScan ? (
                <div class="row">
                  <button type="button" class="btn btn-primary" disabled={busy} onClick={() => setScanning(true)}>
                    <Icon name="qr" size={22} />
                    {t('attendance.scanQr')}
                  </button>
                  <SpeakButton text={t('attendance.scanQr')} />
                </div>
              ) : (
                <p class="muted">{t('attendance.noScanner')}</p>
              )}

              <form
                class="stack"
                onSubmit={(event) => {
                  event.preventDefault();
                  const value = tokenFromScan(code);
                  if (value) void checkIn({ qrToken: value });
                }}
              >
                <div class="field">
                  <label class="field-label" for="gate-code">
                    {t('attendance.codeLabel')}
                  </label>
                  <input
                    id="gate-code"
                    type="text"
                    autocomplete="off"
                    autocapitalize="off"
                    spellcheck={false}
                    value={code}
                    onInput={(event) => setCode((event.currentTarget as HTMLInputElement).value)}
                  />
                </div>
                <div class="row">
                  <button type="submit" class="btn" disabled={busy || !code.trim()}>
                    {t('attendance.codeSubmit')}
                  </button>
                  <SpeakButton text={t('attendance.codeSubmit')} />
                </div>
              </form>
            </>
          ) : null}

          {config.checkInModes.includes('geo') ? (
            <div class="row">
              <button type="button" class="btn" disabled={busy} onClick={() => void checkInByLocation()}>
                <Icon name="location" size={22} />
                {t('attendance.useLocation')}
              </button>
              <SpeakButton text={t('attendance.useLocation')} />
            </div>
          ) : null}
        </section>
      )}

      <section class="stack" aria-labelledby="recent-title">
        <h2 id="recent-title">{t('attendance.recent')}</h2>
        {attendance.data && attendance.data.recent.length === 0 ? <p class="muted">{t('attendance.noShifts')}</p> : null}
        {attendance.data && attendance.data.recent.length > 0 ? (
          <div class="table-wrap">
            <table class="table">
              <caption class="visually-hidden">{t('attendance.recent')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('attendance.colDate')}</th>
                  <th scope="col">{t('attendance.colHours')}</th>
                  <th scope="col">{t('attendance.colOvertime')}</th>
                  <th scope="col">{t('attendance.colNight')}</th>
                </tr>
              </thead>
              <tbody>
                {attendance.data.recent.map((shift) => (
                  <tr key={shift.id}>
                    <td>{formatDay(istDay(shift.checkIn))}</td>
                    <td>
                      {shift.checkOut ? t('common.hours', { hours: shift.summary.hours }) : t('attendance.inProgress')}
                    </td>
                    <td>{t('common.hours', { hours: shift.summary.overtimeHours })}</td>
                    <td>{t('common.hours', { hours: shift.summary.nightHours })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}
