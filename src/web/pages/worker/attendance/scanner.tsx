import { useEffect, useRef } from 'preact/hooks';

interface Detector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
type DetectorCtor = new (options: { formats: string[] }) => Detector;

/** BarcodeDetector plus camera access, or null when this phone cannot scan. */
export function scannerSupport(): DetectorCtor | null {
  const ctor = (globalThis as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
  if (typeof ctor !== 'function') return null;
  if (typeof navigator === 'undefined') return null;
  // Typed as always present, but browsers without media devices leave it undefined.
  const devices = navigator.mediaDevices as MediaDevices | undefined;
  if (!devices?.getUserMedia) return null;
  return ctor;
}

/** The QR may hold the bare token or a link with ?token=. Accept both. */
export function tokenFromScan(raw: string): string {
  const value = raw.trim();
  try {
    return new URL(value).searchParams.get('token') ?? value;
  } catch {
    return value;
  }
}

export function currentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    // Typed as always present, but browsers without geolocation leave it undefined.
    const geo = typeof navigator === 'undefined' ? undefined : (navigator.geolocation as Geolocation | undefined);
    if (!geo) {
      reject(new Error('no geolocation'));
      return;
    }
    geo.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      reject,
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  });
}

/** Live camera view that reports the first QR code it reads. Stops itself once a code is found or it unmounts. */
export function QrScanner({ onCode, onFail }: { onCode: (value: string) => void; onFail: () => void }) {
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
