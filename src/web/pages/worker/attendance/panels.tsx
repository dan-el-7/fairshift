import type { RefObject } from 'preact';
import type { CheckInRequest } from '../../../../shared/api';
import { Icon } from '../../../components/Icon';
import { SpeakButton } from '../../../components/SpeakButton';
import { t } from '../../../i18n';
import { QrScanner, scannerSupport, tokenFromScan } from './scanner';

/** The check-in methods. Each keeps its existing behaviour; the segmented control only chooses which one is shown. */
export type Mode = 'scan' | 'code' | 'geo';

interface ScanPanelProps {
  busy: boolean;
  canScan: boolean;
  scanning: boolean;
  onStart: () => void;
  onStop: () => void;
  onCode: (value: string) => void;
  onFail: () => void;
}

function ScanPanel({ busy, canScan, scanning, onStart, onStop, onCode, onFail }: ScanPanelProps) {
  return (
    <div class="stack">
      {scanning ? (
        <>
          <QrScanner onCode={onCode} onFail={onFail} />
          <p class="muted">{t('attendance.scanHint')}</p>
          <div class="row">
            <button type="button" class="btn" onClick={onStop}>
              <Icon name="stop" size={20} />
              {t('attendance.stopScan')}
            </button>
          </div>
        </>
      ) : canScan ? (
        <div class="row">
          <button type="button" class="btn btn-primary" disabled={busy} onClick={onStart}>
            <Icon name="qr" size={20} />
            {t('attendance.scanQr')}
          </button>
          <SpeakButton text={t('attendance.scanQr')} />
        </div>
      ) : (
        <p class="muted">{t('attendance.noScanner')}</p>
      )}
    </div>
  );
}

interface CodePanelProps {
  busy: boolean;
  code: string;
  inputRef: RefObject<HTMLInputElement | null>;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
}

function CodePanel({ busy, code, inputRef, onChange, onSubmit }: CodePanelProps) {
  return (
    <form
      class="stack"
      onSubmit={(event) => {
        event.preventDefault();
        const value = tokenFromScan(code);
        if (value) onSubmit(value);
      }}
    >
      <div class="field">
        <label class="field-label" for="gate-code">
          {t('attendance.codeLabel')}
        </label>
        <input
          id="gate-code"
          ref={inputRef}
          type="text"
          autocomplete="off"
          autocapitalize="off"
          spellcheck={false}
          value={code}
          onInput={(event) => onChange(event.currentTarget.value)}
        />
      </div>
      <div class="row">
        <button type="submit" class="btn" disabled={busy || !code.trim()}>
          {t('attendance.codeSubmit')}
        </button>
        <SpeakButton text={t('attendance.codeSubmit')} />
      </div>
    </form>
  );
}

function GeoPanel({ busy, onLocate }: { busy: boolean; onLocate: () => void }) {
  return (
    <div class="row">
      <button type="button" class="btn" disabled={busy} onClick={onLocate}>
        <Icon name="location" size={20} />
        {t('attendance.useLocation')}
      </button>
      <SpeakButton text={t('attendance.useLocation')} />
    </div>
  );
}

export interface MethodPanelProps {
  mode: Mode;
  busy: boolean;
  scanning: boolean;
  setScanning: (value: boolean) => void;
  code: string;
  setCode: (value: string) => void;
  codeRef: RefObject<HTMLInputElement | null>;
  onCheckIn: (body: CheckInRequest) => void;
  onCameraDenied: () => void;
  onFallback: () => void;
  onLocate: () => void;
}

/** Shows the panel for the selected method. Only rendered while no shift is open. */
export function MethodPanel({
  mode,
  busy,
  scanning,
  setScanning,
  code,
  setCode,
  codeRef,
  onCheckIn,
  onCameraDenied,
  onFallback,
  onLocate,
}: MethodPanelProps) {
  if (mode === 'scan') {
    return (
      <ScanPanel
        busy={busy}
        canScan={scannerSupport() !== null}
        scanning={scanning}
        onStart={() => setScanning(true)}
        onStop={() => setScanning(false)}
        onCode={(value) => {
          setScanning(false);
          onCheckIn({ qrToken: tokenFromScan(value) });
        }}
        onFail={() => {
          setScanning(false);
          onCameraDenied();
          onFallback();
        }}
      />
    );
  }
  if (mode === 'code') {
    return (
      <CodePanel
        busy={busy}
        code={code}
        inputRef={codeRef}
        onChange={setCode}
        onSubmit={(value) => onCheckIn({ qrToken: value })}
      />
    );
  }
  return <GeoPanel busy={busy} onLocate={onLocate} />;
}
