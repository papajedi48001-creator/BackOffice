'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { MciIncidentKind } from '@backoffice/contracts';
import { ActionDialog } from '../../../../components/action-dialog';
import { FormDialog } from '../../../../components/form-dialog';
import { ThaiDateTimeInput } from '../../../../components/thai-date-input';
import { fromBangkokLocal, toBangkokLocal } from '../../../../lib/fleet-labels';
import { sendMci } from '../../../../lib/mci-labels';

type NotifyMode = 'ALL' | 'PROFESSIONS' | 'NONE';

/** เปิดเหตุ: title, เหตุจริง or ซ้อมแผน, place, time, and who is called to รายงานตัว (LINE group and the bell). */
export function OpenIncidentForm({ professions, disabled }: { professions: ReadonlyArray<{ id: string; name: string }>; disabled: boolean }) {
  const router = useRouter();
  const ids = useId();
  const now = () => toBangkokLocal(new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString());
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<MciIncidentKind>('REAL');
  const [location, setLocation] = useState('');
  const [occurredAt, setOccurredAt] = useState(now);
  const [mode, setMode] = useState<NotifyMode>('ALL');
  const [chosen, setChosen] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const when = fromBangkokLocal(occurredAt);
  const ready = title.trim() !== '' && when !== null && (mode !== 'PROFESSIONS' || chosen.length > 0);
  async function submit(): Promise<boolean> {
    if (!when) return false;
    setError(null);
    const { error: failure } = await sendMci('/api/mci/incidents', 'POST', { title: title.trim(), kind, location: location.trim(), occurredAt: when, notify: { mode, professionIds: mode === 'PROFESSIONS' ? chosen : [] } });
    if (failure) { setError(failure); return false; }
    router.push('/mci/ops');
    router.refresh();
    return true;
  }
  return <FormDialog title="เปิดเหตุอุบัติเหตุหมู่" triggerLabel="เปิดเหตุใหม่" triggerClassName="mci-primary-action" triggerDisabled={disabled} submitLabel="เปิดเหตุและเรียกคน" tone="danger" wide ready={ready} error={error}
    onOpenChange={(open) => { if (open) { setError(null); setOccurredAt(now()); } }} onSubmit={submit}>
    <div className="mci-form-grid">
      <label htmlFor={`${ids}-title`}>ชื่อเหตุ</label>
      <input id={`${ids}-title`} value={title} maxLength={200} required onChange={(event) => setTitle(event.target.value)} />
      <label htmlFor={`${ids}-location`}>สถานที่เกิดเหตุ</label>
      <input id={`${ids}-location`} value={location} maxLength={300} onChange={(event) => setLocation(event.target.value)} />
      <label htmlFor={`${ids}-at`}>เวลาเกิดเหตุ</label>
      <ThaiDateTimeInput id={`${ids}-at`} label="เวลาเกิดเหตุ" value={occurredAt} required onChange={setOccurredAt} />
    </div>
    <fieldset>
      <legend>ประเภท</legend>
      <label><input type="radio" name={`${ids}-kind`} checked={kind === 'REAL'} onChange={() => setKind('REAL')} /> เหตุจริง</label>
      <label><input type="radio" name={`${ids}-kind`} checked={kind === 'DRILL'} onChange={() => setKind('DRILL')} /> ซ้อมแผน (ข้อความทุกช่องทางขึ้นต้นด้วย [ซ้อมแผน])</label>
    </fieldset>
    <fieldset>
      <legend>เรียกเจ้าหน้าที่มารายงานตัว (LINE กลุ่มและกระดิ่งแจ้งเตือน ไม่มีข้อมูลผู้ป่วย)</legend>
      <label><input type="radio" name={`${ids}-notify`} checked={mode === 'ALL'} onChange={() => setMode('ALL')} /> ทุกคน</label>
      <label><input type="radio" name={`${ids}-notify`} checked={mode === 'PROFESSIONS'} onChange={() => setMode('PROFESSIONS')} /> เฉพาะสายวิชาชีพที่เลือก</label>
      {mode === 'PROFESSIONS' && <div className="mci-profession-picks">
        {professions.map((profession) => <label key={profession.id}>
          <input type="checkbox" checked={chosen.includes(profession.id)} onChange={(event) => setChosen((current) => event.target.checked ? [...current, profession.id] : current.filter((id) => id !== profession.id))} /> {profession.name}
        </label>)}
      </div>}
      <label><input type="radio" name={`${ids}-notify`} checked={mode === 'NONE'} onChange={() => setMode('NONE')} /> ไม่ส่งแจ้งเตือน</label>
    </fieldset>
  </FormDialog>;
}

/** ปิดเหตุ: everyone still on duty is checked out and told; the เหตุ becomes history. */
export function CloseIncidentButton({ incidentId, title }: { incidentId: string; title: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function confirm() {
    setBusy(true); setError(null);
    const { error: failure } = await sendMci(`/api/mci/incidents/${encodeURIComponent(incidentId)}/closure`, 'POST');
    setBusy(false);
    if (failure) { setError(failure); return; }
    setOpen(false);
    router.refresh();
  }
  return <>
    <button type="button" className="button-danger-solid" onClick={() => { setError(null); setOpen(true); }}>ปิดเหตุ</button>
    {open && <ActionDialog title="ปิดเหตุอุบัติเหตุหมู่" message={`ปิด "${title}" ทุกคนที่ยังอยู่เวรจะถูกออกจากเวร และกระดานสาธารณะจะแสดงว่าไม่มีเหตุ`} confirmLabel="ยืนยันปิดเหตุ" tone="danger"
      isSubmitting={busy} error={error} onConfirm={() => void confirm()} onClose={() => setOpen(false)} />}
  </>;
}

/** พิมพ์สรุป: the browser's print dialog for the summary page. */
export function PrintButton() {
  return <button type="button" className="button-secondary" onClick={() => window.print()}>พิมพ์สรุป</button>;
}
