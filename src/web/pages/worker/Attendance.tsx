import { useRef, useState } from 'preact/hooks';
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
import { MethodPanel, type Mode } from './attendance/panels';
import { currentPosition, scannerSupport, tokenFromScan } from './attendance/scanner';

interface Notice {
  tone: BannerTone;
  text: string;
}

function checkInError(err: unknown, byQr: boolean): string {
  if (err instanceof ApiError && err.status === 0) return errorMessage(err);
  if (byQr && err instanceof ApiError && err.status === 400) return t('attendance.invalidCode');
  return t('attendance.checkInFailed');
}

/** Check-in, check-out and location check-in, with the busy flag and the result notice they share. */
function useCheckIn(reload: () => void) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  async function checkIn(body: CheckInRequest) {
    setBusy(true);
    setNotice(null);
    try {
      await api.post<Shift>('/api/attendance/check-in', body);
      setNotice({ tone: 'success', text: t('attendance.checkedIn') });
      reload();
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
      reload();
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

  return { busy, notice, setNotice, checkIn, checkOut, checkInByLocation };
}

interface CheckInCardProps {
  open: Shift | null;
  busy: boolean;
  /** Methods this site allows, in display order. */
  modes: Mode[];
  onCheckIn: (body: CheckInRequest) => void;
  onCheckOut: () => void;
  onLocate: () => void;
  onCameraDenied: () => void;
}

function CheckInCard({ open, busy, modes, onCheckIn, onCheckOut, onLocate, onCameraDenied }: CheckInCardProps) {
  const canScan = scannerSupport() !== null;
  const [mode, setMode] = useState<Mode>(() => {
    const initial = modes[0] ?? 'geo';
    return initial === 'scan' && !canScan ? 'code' : initial;
  });
  const [scanning, setScanning] = useState(false);
  const [code, setCode] = useState('');
  const codeRef = useRef<HTMLInputElement>(null);

  const openText = open ? t('attendance.openSince', { time: formatTime(open.checkIn) }) : t('home.notCheckedIn');
  const modeLabel: Record<Mode, string> = {
    scan: t('attendance.scanQr'),
    code: t('attendance.codeLabel'),
    geo: t('attendance.useLocation'),
  };
  const heroLabel = open ? t('attendance.checkOut') : t('attendance.checkIn');

  /** The big button: check out when open, otherwise start the check-in method currently selected. */
  function heroPress() {
    if (open) {
      onCheckOut();
      return;
    }
    if (mode === 'scan') {
      if (canScan) setScanning(true);
      else setMode('code');
      return;
    }
    if (mode === 'geo') {
      onLocate();
      return;
    }
    if (code.trim()) onCheckIn({ qrToken: tokenFromScan(code) });
    else codeRef.current?.focus();
  }

  return (
    <section class="card hero" aria-label={heroLabel}>
      <div class="status-row">
        <span class={`status-chip${open ? ' is-in' : ''}`}>
          <span class="status-dot" aria-hidden="true" />
          {openText}
        </span>
        <SpeakButton text={`${openText}. ${heroLabel}`} />
      </div>

      <button
        type="button"
        class={`hero-btn${open ? ' is-open' : ''}`}
        disabled={busy || (!open && modes.length === 0)}
        onClick={heroPress}
      >
        <Icon name="checkin" size={40} />
        <span>{heroLabel}</span>
      </button>

      {!open && modes.length > 1 ? (
        <div class="segmented" role="group" aria-label={t('attendance.title')}>
          {modes.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => {
                setMode(value);
                setScanning(false);
              }}
            >
              {modeLabel[value]}
            </button>
          ))}
        </div>
      ) : null}

      {!open ? (
        <>
          {mode === 'code' && !canScan ? <p class="muted">{t('attendance.noScanner')}</p> : null}
          <MethodPanel
            mode={mode}
            busy={busy}
            scanning={scanning}
            setScanning={setScanning}
            code={code}
            setCode={setCode}
            codeRef={codeRef}
            onCheckIn={onCheckIn}
            onCameraDenied={onCameraDenied}
            onFallback={() => setMode('code')}
            onLocate={onLocate}
          />
        </>
      ) : null}
    </section>
  );
}

function RecentShifts({ shifts }: { shifts: ShiftWithSummary[] | undefined }) {
  if (!shifts) return null;
  if (shifts.length === 0) return <p class="muted">{t('attendance.noShifts')}</p>;
  return (
    <ul class="shift-list">
      {shifts.map((shift) => (
        <li key={shift.id}>
          <span class="shift-date">{formatDay(istDay(shift.checkIn))}</span>
          <span class="shift-meta">
            <span>{shift.checkOut ? t('common.hours', { hours: shift.summary.hours }) : t('attendance.inProgress')}</span>
            {shift.summary.overtimeHours > 0 ? (
              <span class="badge badge-overtime">
                {t('attendance.colOvertime')}: {t('common.hours', { hours: shift.summary.overtimeHours })}
              </span>
            ) : null}
            {shift.summary.nightHours > 0 ? (
              <span class="tag">
                {t('attendance.colNight')}: {t('common.hours', { hours: shift.summary.nightHours })}
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function Attendance({ me }: { me: Me }) {
  const attendance = useApiData<AttendanceMe>('/api/attendance/me');
  const { busy, notice, setNotice, checkIn, checkOut, checkInByLocation } = useCheckIn(() => attendance.reload());

  const config = INDUSTRIES[me.site.industry];
  const modes: Mode[] = [
    ...(config.checkInModes.includes('qr') ? (['scan', 'code'] as Mode[]) : []),
    ...(config.checkInModes.includes('geo') ? (['geo'] as Mode[]) : []),
  ];

  return (
    <div class="stack">
      <h1>{t('attendance.title')}</h1>

      {notice ? <Banner tone={notice.tone}>{notice.text}</Banner> : null}
      {attendance.error ? <ErrorMessage error={attendance.error} onRetry={attendance.reload} /> : null}
      {attendance.loading && !attendance.data ? <Spinner /> : null}

      <CheckInCard
        open={attendance.data?.open ?? null}
        busy={busy}
        modes={modes}
        onCheckIn={(body) => void checkIn(body)}
        onCheckOut={() => void checkOut()}
        onLocate={() => void checkInByLocation()}
        onCameraDenied={() => setNotice({ tone: 'warn', text: t('attendance.cameraDenied') })}
      />

      <section class="stack" aria-labelledby="recent-title">
        <h2 id="recent-title">{t('attendance.recent')}</h2>
        <RecentShifts shifts={attendance.data?.recent} />
      </section>
    </div>
  );
}
