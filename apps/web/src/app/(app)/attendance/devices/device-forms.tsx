'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ActionDialog } from '../../../../components/action-dialog';
import { FormDialog } from '../../../../components/form-dialog';
import { attendanceText, sendAttendance } from '../../../../lib/attendance-labels';

export interface LocationRow { id: string; name: string; latitude: number; longitude: number; radiusMeters: number; isActive: boolean }

/** Adds (no `row`) or edits a จุดลงเวลา: its coordinates and the GPS radius a phone must be inside. */
export function LocationForm({ row, defaultRadius = 100 }: { row?: LocationRow; defaultRadius?: number }) {
  const router = useRouter();
  const ids = useId();
  const blank = () => ({ name: row?.name ?? '', latitude: row ? String(row.latitude) : '', longitude: row ? String(row.longitude) : '', radiusMeters: String(row?.radiusMeters ?? defaultRadius), isActive: row?.isActive ?? true });
  const [values, setValues] = useState(blank);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<ReturnType<typeof blank>>) => setValues((current) => ({ ...current, ...patch }));
  const latitude = Number(values.latitude);
  const longitude = Number(values.longitude);
  const radius = Number(values.radiusMeters);
  const ready = values.name.trim() !== '' && values.latitude !== '' && latitude >= -90 && latitude <= 90 && values.longitude !== '' && longitude >= -180 && longitude <= 180 && Number.isInteger(radius) && radius >= 10 && radius <= 2000;
  async function submit(): Promise<boolean> {
    setError(null);
    const { error: failure } = await sendAttendance(row ? `/api/attendance/locations/${encodeURIComponent(row.id)}` : '/api/attendance/locations', row ? 'PUT' : 'POST', { name: values.name.trim(), latitude, longitude, radiusMeters: radius, isActive: values.isActive });
    if (failure) { setError(failure); return false; }
    router.refresh();
    return true;
  }
  const title = row ? `แก้ไขจุดลงเวลา ${row.name}` : 'เพิ่มจุดลงเวลา';
  return <FormDialog title={title} triggerLabel={row ? 'แก้ไข' : 'เพิ่มจุดลงเวลา'} triggerAriaLabel={title} triggerClassName={row ? 'button-secondary' : undefined} submitLabel={attendanceText.save} ready={ready} error={error}
    onOpenChange={(open) => { if (open) { setError(null); setValues(blank()); } }} onSubmit={submit}>
    <div className="attendance-form-grid">
      <label htmlFor={`${ids}-name`}>ชื่อจุด</label>
      <input id={`${ids}-name`} value={values.name} maxLength={100} required onChange={(event) => set({ name: event.target.value })} />
      <label htmlFor={`${ids}-lat`}>ละติจูด</label>
      <input id={`${ids}-lat`} type="number" step="0.000001" min={-90} max={90} value={values.latitude} required onChange={(event) => set({ latitude: event.target.value })} />
      <label htmlFor={`${ids}-lng`}>ลองจิจูด</label>
      <input id={`${ids}-lng`} type="number" step="0.000001" min={-180} max={180} value={values.longitude} required onChange={(event) => set({ longitude: event.target.value })} />
      <label htmlFor={`${ids}-radius`}>รัศมี (เมตร)</label>
      <input id={`${ids}-radius`} type="number" inputMode="numeric" min={10} max={2000} step={1} value={values.radiusMeters} required onChange={(event) => set({ radiusMeters: event.target.value })} />
    </div>
    <p className="field-hint">คัดลอกพิกัดจาก Google Maps (กดค้างที่จุดแล้วคัดลอกตัวเลข) ตำแหน่งนี้ใช้ตรวจ GPS ของมือถือเท่านั้น</p>
    <label><input type="checkbox" checked={values.isActive} onChange={(event) => set({ isActive: event.target.checked })} /> เปิดใช้</label>
  </FormDialog>;
}

const groupDigits = (code: string) => `${code.slice(0, 4)} ${code.slice(4)}`;

/** The รหัสจับคู่ in large digits. It is shown once; closing the popup forgets it. */
function PairingCodeDialog({ code, deviceName, onClose }: { code: string; deviceName: string; onClose: () => void }) {
  return <ActionDialog title={`รหัสจับคู่ ${deviceName}`} confirmLabel="ปิด" onConfirm={onClose} onClose={onClose}>
    <p className="attendance-pairing-code">{groupDigits(code)}</p>
    <p>เปิดหน้า /kiosk บนกล่อง แล้วกรอกรหัสนี้ ใช้ได้ภายใน 10 นาที และใช้ได้ครั้งเดียว</p>
  </ActionDialog>;
}

/** Adds a กล่องลงเวลา at a จุดลงเวลา and shows its รหัสจับคู่. */
export function DeviceForm({ locations }: { locations: ReadonlyArray<{ id: string; name: string }> }) {
  const router = useRouter();
  const ids = useId();
  const [name, setName] = useState('');
  const [locationId, setLocationId] = useState(locations[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<{ code: string; deviceName: string } | null>(null);
  async function submit(): Promise<boolean> {
    setError(null);
    const { error: failure, result } = await sendAttendance('/api/attendance/devices', 'POST', { name: name.trim(), locationId });
    if (failure || typeof result.pairingCode !== 'string') { setError(failure ?? attendanceText.loadError); return false; }
    setCode({ code: result.pairingCode, deviceName: name.trim() });
    return true;
  }
  return <>
    <FormDialog title="เพิ่มกล่องลงเวลา" triggerLabel="เพิ่มกล่องลงเวลา" triggerDisabled={locations.length === 0} submitLabel="สร้างรหัสจับคู่" ready={name.trim() !== '' && locationId !== ''} error={error}
      onOpenChange={(open) => { if (open) { setError(null); setName(''); setLocationId(locations[0]?.id ?? ''); } }} onSubmit={submit}>
      <div className="attendance-form-grid">
        <label htmlFor={`${ids}-name`}>ชื่อกล่อง</label>
        <input id={`${ids}-name`} value={name} maxLength={100} required onChange={(event) => setName(event.target.value)} />
        <label htmlFor={`${ids}-location`}>จุดลงเวลา</label>
        <select id={`${ids}-location`} value={locationId} onChange={(event) => setLocationId(event.target.value)}>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select>
      </div>
    </FormDialog>
    {code && <PairingCodeDialog code={code.code} deviceName={code.deviceName} onClose={() => { setCode(null); router.refresh(); }} />}
  </>;
}

/** A new รหัสจับคู่ for a box that was replaced or never paired. */
export function NewPairingCodeButton({ deviceId, deviceName }: { deviceId: string; deviceName: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  async function confirm() {
    setBusy(true);
    const { error: failure, result } = await sendAttendance(`/api/attendance/devices/${encodeURIComponent(deviceId)}/pairing-code`, 'POST');
    setBusy(false);
    if (failure || typeof result.pairingCode !== 'string') { setError(failure ?? attendanceText.loadError); return; }
    setConfirming(false);
    setCode(result.pairingCode);
  }
  return <>
    <button type="button" className="button-secondary" aria-label={`สร้างรหัสจับคู่ใหม่ ${deviceName}`} onClick={() => { setError(null); setConfirming(true); }}>รหัสจับคู่ใหม่</button>
    {confirming && <ActionDialog title={`สร้างรหัสจับคู่ใหม่ ${deviceName}`} message="ใช้เมื่อเปลี่ยนกล่องหรือกล่องยังไม่ได้จับคู่ เมื่อจับคู่ด้วยรหัสใหม่ กล่องเครื่องเดิมจะใช้ไม่ได้" confirmLabel="สร้างรหัส" isSubmitting={busy} error={error} onConfirm={() => void confirm()} onClose={() => setConfirming(false)} />}
    {code && <PairingCodeDialog code={code} deviceName={deviceName} onClose={() => { setCode(null); router.refresh(); }} />}
  </>;
}

/** ถอนสิทธิ์กล่อง: its requests are refused at once. Cannot be undone; add a new box instead. */
export function RevokeDeviceButton({ deviceId, deviceName }: { deviceId: string; deviceName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function confirm() {
    setBusy(true);
    const { error: failure } = await sendAttendance(`/api/attendance/devices/${encodeURIComponent(deviceId)}/revoke`, 'POST');
    setBusy(false);
    if (failure) { setError(failure); return; }
    setOpen(false);
    router.refresh();
  }
  return <>
    <button type="button" className="button-danger" aria-label={`ถอนสิทธิ์ ${deviceName}`} onClick={() => { setError(null); setOpen(true); }}>ถอนสิทธิ์</button>
    {open && <ActionDialog title={`ถอนสิทธิ์ ${deviceName}`} message="กล่องนี้จะลงเวลาและติดต่อเซิร์ฟเวอร์ไม่ได้ทันที และย้อนกลับไม่ได้ ถ้าจะใช้อีกให้เพิ่มกล่องใหม่" confirmLabel="ถอนสิทธิ์" tone="danger" isSubmitting={busy} error={error} onConfirm={() => void confirm()} onClose={() => setOpen(false)} />}
  </>;
}
