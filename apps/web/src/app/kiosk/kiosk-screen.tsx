'use client';

import { useCallback, useEffect, useState } from 'react';
import { attendanceErrorMessage } from '../../lib/attendance-labels';
import { kioskDeviceStorageKey, kioskSignedHeaders, loadOrCreateKey, type KioskKey } from '../../lib/kiosk-key';
import { KioskPairing } from './kiosk-pairing';

type Paired = { deviceId: string; deviceName: string; locationName: string };
const HEARTBEAT_MS = 60_000;
const thaiClock = (date: Date) => date.toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const thaiDate = (date: Date) => date.toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

function savedDevice(): Paired | null {
  try { return JSON.parse(localStorage.getItem(kioskDeviceStorageKey) ?? 'null') as Paired | null; } catch { return null; }
}

/** กล่องลงเวลา: pairs once, then shows the server clock from a signed heartbeat. Clocking in arrives in the next delivery step. */
export function KioskScreen() {
  const [key, setKey] = useState<KioskKey | null>(null);
  const [device, setDevice] = useState<Paired | null>(null);
  const [offsetMs, setOffsetMs] = useState<number | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(true);

  useEffect(() => { setDevice(savedDevice()); loadOrCreateKey().then(setKey, () => setError('เบราว์เซอร์นี้สร้างกุญแจของกล่องไม่ได้')); }, []);
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(timer); }, []);

  const heartbeat = useCallback(async () => {
    if (!key || !device) return;
    const path = '/api/kiosk/heartbeat';
    try {
      const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', ...await kioskSignedHeaders(key, device.deviceId, 'POST', path, '{}') }, body: '{}' });
      const result = await response.json().catch(() => ({})) as { serverTime?: string; error?: string };
      if (response.ok && result.serverTime) { setOffsetMs(Date.parse(result.serverTime) - Date.now()); setOnline(true); setError(null); return; }
      if (result.error === 'DEVICE_REVOKED') { localStorage.removeItem(kioskDeviceStorageKey); setDevice(null); }
      setError(attendanceErrorMessage(result.error));
    } catch { setOnline(false); }
  }, [key, device]);
  useEffect(() => { void heartbeat(); const timer = setInterval(() => void heartbeat(), HEARTBEAT_MS); return () => clearInterval(timer); }, [heartbeat]);

  async function pair(pairingCode: string) {
    if (!key) return;
    setBusy(true);
    try {
      const response = await fetch('/api/kiosk/pair', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pairingCode, publicKey: key.publicJwk }) });
      const result = await response.json().catch(() => ({})) as Partial<Paired> & { error?: string };
      if (!response.ok || !result.deviceId) { setError(attendanceErrorMessage(result.error)); return; }
      const paired = { deviceId: result.deviceId, deviceName: result.deviceName ?? '', locationName: result.locationName ?? '' };
      localStorage.setItem(kioskDeviceStorageKey, JSON.stringify(paired));
      setDevice(paired);
      setError(null);
    } catch { setError(attendanceErrorMessage(null)); } finally { setBusy(false); }
  }

  if (!device) return <main className="kiosk"><KioskPairing onPair={pair} busy={busy || !key} error={error} /></main>;
  const serverNow = offsetMs === null ? null : new Date(now.getTime() + offsetMs);
  return <main className="kiosk">
    <header className="kiosk-header"><strong>{device.locationName}</strong><span>{device.deviceName}</span>{!online && <span className="kiosk-offline" role="status">ออฟไลน์</span>}</header>
    <p className="kiosk-clock" aria-live="off">{serverNow ? thaiClock(serverNow) : '--:--:--'}</p>
    <p className="kiosk-date">{serverNow ? thaiDate(serverNow) : 'กำลังซิงก์เวลากับเซิร์ฟเวอร์'}</p>
    {error && <p role="alert">{error}</p>}
    <p className="kiosk-note">ช่องทางลงเวลาจะเปิดในขั้นถัดไป</p>
  </main>;
}
