'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AttendanceSettings } from '@backoffice/contracts';
import { FormDialog } from '../../../../components/form-dialog';
import { attendanceText, sendAttendance, shiftSpanLabel } from '../../../../lib/attendance-labels';

export interface ShiftTypeRow { id: string; name: string; startTime: string; endTime: string; earlyWindowMinutes: number; lateGraceMinutes: number; earlyLeaveGraceMinutes: number; checkoutWindowMinutes: number; colorHex: string; isActive: boolean }

const minuteFields = [
  ['earlyWindowMinutes', 'ลงเวลาเข้าได้ก่อนเริ่มเวร (นาที)', 0, 240],
  ['lateGraceMinutes', 'ผ่อนผันมาสาย (นาที)', 0, 120],
  ['earlyLeaveGraceMinutes', 'ผ่อนผันกลับก่อน (นาที)', 0, 120],
  ['checkoutWindowMinutes', 'ลงเวลาออกได้หลังเลิกเวรภายใน (นาที)', 30, 720]
] as const;

/** Adds (no `row`) or edits a ประเภทเวร. An end at or before the start is shown as ending the next day. */
export function ShiftTypeForm({ row }: { row?: ShiftTypeRow }) {
  const router = useRouter();
  const ids = useId();
  const blank = () => ({ name: row?.name ?? '', startTime: row?.startTime ?? '08:30', endTime: row?.endTime ?? '16:30', colorHex: row?.colorHex ?? '#1D4ED8', isActive: row?.isActive ?? true,
    earlyWindowMinutes: String(row?.earlyWindowMinutes ?? 60), lateGraceMinutes: String(row?.lateGraceMinutes ?? 0), earlyLeaveGraceMinutes: String(row?.earlyLeaveGraceMinutes ?? 0), checkoutWindowMinutes: String(row?.checkoutWindowMinutes ?? 240) });
  const [values, setValues] = useState(blank);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<ReturnType<typeof blank>>) => setValues((current) => ({ ...current, ...patch }));
  const sameTime = values.startTime !== '' && values.startTime === values.endTime;
  const minutesOk = minuteFields.every(([field, , min, max]) => { const value = Number(values[field]); return values[field] !== '' && Number.isInteger(value) && value >= min && value <= max; });
  const ready = values.name.trim() !== '' && /^\d{2}:\d{2}$/.test(values.startTime) && /^\d{2}:\d{2}$/.test(values.endTime) && !sameTime && minutesOk;
  const span = shiftSpanLabel(values.startTime, values.endTime);
  async function submit(): Promise<boolean> {
    setError(null);
    const body = { name: values.name.trim(), startTime: values.startTime, endTime: values.endTime, colorHex: values.colorHex.toUpperCase(), isActive: values.isActive,
      ...Object.fromEntries(minuteFields.map(([field]) => [field, Number(values[field])])) };
    const { error: failure } = await sendAttendance(row ? `/api/attendance/shift-types/${encodeURIComponent(row.id)}` : '/api/attendance/shift-types', row ? 'PUT' : 'POST', body);
    if (failure) { setError(failure); return false; }
    router.refresh();
    return true;
  }
  const title = row ? `แก้ไขประเภทเวร ${row.name}` : 'เพิ่มประเภทเวร';
  return <FormDialog title={title} triggerLabel={row ? 'แก้ไข' : 'เพิ่มประเภทเวร'} triggerAriaLabel={title} triggerClassName={row ? 'button-secondary' : undefined} submitLabel={attendanceText.save} ready={ready} error={error}
    onOpenChange={(open) => { if (open) { setError(null); setValues(blank()); } }} onSubmit={submit}>
    <div className="attendance-form-grid">
      <label htmlFor={`${ids}-name`}>ชื่อเวร</label>
      <input id={`${ids}-name`} value={values.name} maxLength={60} required onChange={(event) => set({ name: event.target.value })} />
      <label htmlFor={`${ids}-start`}>เวลาเริ่ม</label>
      <input id={`${ids}-start`} type="time" value={values.startTime} required onChange={(event) => set({ startTime: event.target.value })} />
      <label htmlFor={`${ids}-end`}>เวลาเลิก</label>
      <input id={`${ids}-end`} type="time" value={values.endTime} required aria-describedby={`${ids}-span`} onChange={(event) => set({ endTime: event.target.value })} />
      <span />
      <p id={`${ids}-span`} className={sameTime ? 'field-error' : 'field-hint'}>{sameTime ? 'เวลาเริ่มและเวลาเลิกต้องไม่เท่ากัน' : span}</p>
      {minuteFields.map(([field, label, min, max]) => <div key={field} className="attendance-form-row">
        <label htmlFor={`${ids}-${field}`}>{label}</label>
        <input id={`${ids}-${field}`} type="number" inputMode="numeric" min={min} max={max} step={1} value={values[field]} required onChange={(event) => set({ [field]: event.target.value })} />
      </div>)}
      <label htmlFor={`${ids}-color`}>สี</label>
      <input id={`${ids}-color`} type="color" value={values.colorHex} onChange={(event) => set({ colorHex: event.target.value })} />
    </div>
    <label><input type="checkbox" checked={values.isActive} onChange={(event) => set({ isActive: event.target.checked })} /> เปิดใช้</label>
  </FormDialog>;
}

const settingFields: ReadonlyArray<readonly [keyof AttendanceSettings, string, number, number]> = [
  ['gpsMaxAccuracyMeters', 'ความแม่นยำ GPS ที่ยอมรับ (เมตร)', 5, 500],
  ['gpsMaxAgeSeconds', 'อายุตำแหน่ง GPS สูงสุด (วินาที)', 10, 600],
  ['defaultRadiusMeters', 'รัศมีเริ่มต้นของจุดลงเวลา (เมตร)', 10, 2000],
  ['pinMaxAttempts', 'กรอก PIN ผิดได้ (ครั้ง) ก่อนล็อก', 3, 10],
  ['pinLockMinutes', 'ล็อก PIN นาน (นาที)', 1, 120],
  ['requestWindowDays', 'ยื่นคำขอย้อนหลังได้ (วัน)', 1, 90],
  ['retentionDays', 'เก็บภาพและพิกัด (วัน)', 30, 3650]
];

/** ค่าตั้งระบบลงเวลา in one popup. */
export function SettingsForm({ settings }: { settings: AttendanceSettings }) {
  const router = useRouter();
  const ids = useId();
  const blank = () => Object.fromEntries(settingFields.map(([key]) => [key, String(settings[key])])) as Record<keyof AttendanceSettings, string>;
  const [values, setValues] = useState(blank);
  const [error, setError] = useState<string | null>(null);
  const ready = settingFields.every(([key, , min, max]) => { const value = Number(values[key]); return values[key] !== '' && Number.isInteger(value) && value >= min && value <= max; });
  async function submit(): Promise<boolean> {
    setError(null);
    const { error: failure } = await sendAttendance('/api/attendance/settings', 'PUT', Object.fromEntries(settingFields.map(([key]) => [key, Number(values[key])])));
    if (failure) { setError(failure); return false; }
    router.refresh();
    return true;
  }
  return <FormDialog title="แก้ไขค่าตั้ง" triggerLabel="แก้ไขค่าตั้ง" submitLabel={attendanceText.save} ready={ready} error={error} onOpenChange={(open) => { if (open) { setError(null); setValues(blank()); } }} onSubmit={submit}>
    <div className="attendance-form-grid">
      {settingFields.map(([key, label, min, max]) => <div key={key} className="attendance-form-row">
        <label htmlFor={`${ids}-${key}`}>{label}</label>
        <input id={`${ids}-${key}`} type="number" inputMode="numeric" min={min} max={max} step={1} value={values[key]} required onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))} />
      </div>)}
    </div>
  </FormDialog>;
}

export const settingLabels = settingFields.map(([key, label]) => ({ key, label }));
