'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

/** `navigator.onLine`, live. The server snapshot is "online" so nothing flashes on first paint. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    (notify) => {
      window.addEventListener('online', notify);
      window.addEventListener('offline', notify);
      return () => {
        window.removeEventListener('online', notify);
        window.removeEventListener('offline', notify);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

/** The current time, refreshed every `everyMs` while `active` (drives the undo countdown). */
export function useNow(everyMs: number, active = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), everyMs);
    return () => window.clearInterval(timer);
  }, [everyMs, active]);
  return now;
}

/** True when the browser can read barcodes from the camera (BarcodeDetector + getUserMedia). */
export function useCanScan(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => 'BarcodeDetector' in window && Boolean(navigator.mediaDevices?.getUserMedia),
    () => false,
  );
}
