'use client';

import { useEffect, useRef, useState } from 'react';
import { Sheet } from '@/components/ui/sheet';

/**
 * Camera barcode scanning, where the browser can do it.
 *
 * Uses the platform's BarcodeDetector (Chrome and Edge on Android and desktop, Safari behind a flag).
 * Where it is missing the Scan button is not shown at all (see `useCanScan`), and a USB or Bluetooth
 * scanner still works because it types the code into the search box. Where the camera is refused,
 * or blocked by the site's own policy, the sheet says so in words and the search box remains.
 *
 * The camera stream is stopped the moment the sheet closes or unmounts.
 */

type DetectedBarcode = { rawValue: string };
type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>;
};
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'];
const SCAN_EVERY_MS = 250;
/** The same code held in front of the camera is read many times; count it once. */
const REPEAT_GUARD_MS = 1800;

export function ScannerSheet({
  open,
  onOpenChange,
  onCode,
  lastResult,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Return a short sentence saying what the code did ("Added KZ ZS10") for the sheet to show. */
  onCode: (code: string) => string;
  lastResult?: string | null;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<'starting' | 'scanning' | 'blocked' | 'unsupported'>(
    'starting',
  );
  const [message, setMessage] = useState<string | null>(null);
  const onCodeRef = useRef(onCode);
  useEffect(() => {
    onCodeRef.current = onCode;
  });

  useEffect(() => {
    if (!open) return;
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let lastCode = '';
    let lastAt = 0;
    setStatus('starting');
    setMessage(null);

    async function start() {
      const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
        .BarcodeDetector;
      if (!Detector || !navigator.mediaDevices?.getUserMedia) {
        setStatus('unsupported');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
      } catch {
        if (!stopped) setStatus('blocked');
        return;
      }
      if (stopped) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      // The sheet's content mounts a beat after it opens, so wait for the video element.
      let video = videoRef.current;
      for (let attempt = 0; attempt < 40 && !video && !stopped; attempt++) {
        await new Promise((resolve) => window.setTimeout(resolve, 50));
        video = videoRef.current;
      }
      if (!video || stopped) {
        if (stream) for (const track of stream.getTracks()) track.stop();
        return;
      }
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        // Autoplay can be refused before a gesture; the stream still attaches.
      }
      const detector = new Detector({ formats: FORMATS });
      setStatus('scanning');

      const tick = async () => {
        if (stopped) return;
        try {
          if (video.readyState >= 2) {
            const [hit] = await detector.detect(video);
            const value = hit?.rawValue?.trim();
            const now = Date.now();
            if (value && (value !== lastCode || now - lastAt > REPEAT_GUARD_MS)) {
              lastCode = value;
              lastAt = now;
              setMessage(onCodeRef.current(value));
            }
          }
        } catch {
          // A frame that cannot be read is just skipped.
        }
        if (!stopped) timer = window.setTimeout(tick, SCAN_EVERY_MS);
      };
      timer = window.setTimeout(tick, SCAN_EVERY_MS);
    }

    void start();
    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
      if (stream) for (const track of stream.getTracks()) track.stop();
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [open]);

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Scan a barcode"
      description="Hold the barcode inside the frame. Each scan adds one to the cart."
    >
      <div className="flex flex-col gap-3">
        {status === 'blocked' || status === 'unsupported' ? (
          <p
            role="alert"
            className="rounded-card border border-line bg-inset p-3 text-[14px] text-ink-2"
          >
            {status === 'blocked'
              ? 'The camera is not available. Allow camera access for this site in the browser settings, or type the SKU in the search box.'
              : 'This browser cannot scan barcodes. Type the SKU in the search box, or use a barcode scanner.'}
          </p>
        ) : (
          <div className="relative overflow-hidden rounded-card bg-black">
            <video
              ref={videoRef}
              muted
              playsInline
              aria-label="Camera view"
              className="aspect-[4/3] w-full object-cover"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-[18%_10%] rounded-card border-2 border-white/80"
            />
          </div>
        )}
        <p role="status" aria-live="polite" className="min-h-6 text-[14px] text-ink">
          {message ??
            lastResult ??
            (status === 'starting'
              ? 'Starting the camera'
              : status === 'scanning'
                ? 'Looking for a barcode'
                : '')}
        </p>
      </div>
    </Sheet>
  );
}
