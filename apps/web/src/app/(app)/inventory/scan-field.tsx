'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import type { ScanResult } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { CameraScanner } from './camera-scanner';
import { inventoryErrorText } from './inventory-errors';

/**
 * One input for both kinds of scanner: a USB/Bluetooth scanner types the code and presses Enter,
 * and the camera button reads a code through the browser and submits it the same way.
 */
export function ScanField({ onResult, onNotFound, label = t('inventoryScanLabel') }: { onResult(result: ScanResult): void; onNotFound?(code: string): void; label?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [camera, setCamera] = useState(false);

  async function lookUp(raw: string) {
    const code = raw.trim();
    setValue('');
    input.current?.focus();
    if (!code) return;
    setMessage(null);
    try {
      const response = await fetch(`/api/inventory/scan?code=${encodeURIComponent(code)}`, { headers: { accept: 'application/json' } });
      const body = await response.json() as ScanResult & { error?: string };
      if (response.ok) { onResult(body); return; }
      setMessage(inventoryErrorText(body.error));
      if (response.status === 404) onNotFound?.(code);
    } catch {
      setMessage(t('inventoryActionFailed'));
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    void lookUp(event.currentTarget.value);
  }

  function openCamera() {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) { setMessage(t('inventoryCameraUnavailable')); return; }
    setMessage(null);
    setCamera(true);
  }

  return (
    <div className="inventory-scan">
      <label>
        {label}
        <input ref={input} value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={onKeyDown} autoFocus enterKeyHint="done" autoComplete="off" spellCheck={false} />
      </label>
      <button type="button" onClick={camera ? () => setCamera(false) : openCamera}>{camera ? t('inventoryScanClose') : t('inventoryScanCamera')}</button>
      {camera ? <CameraScanner onCode={(code) => { setCamera(false); void lookUp(code); }} onUnavailable={() => { setCamera(false); setMessage(t('inventoryCameraUnavailable')); }} /> : null}
      {message ? <p role="alert">{message}</p> : null}
    </div>
  );
}
