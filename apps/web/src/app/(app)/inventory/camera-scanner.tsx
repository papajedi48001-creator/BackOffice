'use client';

import { useEffect, useRef } from 'react';

/** Reads one barcode or QR code from the back camera, then stops the stream. The decoder loads only when the camera opens. */
export function CameraScanner({ onCode, onUnavailable }: { onCode(code: string): void; onUnavailable(): void }) {
  const video = useRef<HTMLVideoElement>(null);
  const callbacks = useRef({ onCode, onUnavailable });
  callbacks.current = { onCode, onUnavailable };

  useEffect(() => {
    let controls: { stop(): void } | undefined;
    let cancelled = false;
    void (async () => {
      try {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import('@zxing/browser'), import('@zxing/library')]);
        const hints = new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.QR_CODE]]]);
        const reader = new BrowserMultiFormatReader(hints);
        controls = await reader.decodeFromConstraints({ video: { facingMode: 'environment' } }, video.current!, (result, _error, active) => {
          if (!result || cancelled) return;
          cancelled = true;
          active.stop();
          callbacks.current.onCode(result.getText());
        });
        if (cancelled) controls.stop();
      } catch {
        if (!cancelled) callbacks.current.onUnavailable();
      }
    })();
    return () => { cancelled = true; controls?.stop(); };
  }, []);

  return <video ref={video} className="inventory-camera" muted playsInline aria-hidden="true" />;
}
