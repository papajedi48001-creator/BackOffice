'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FormDialog } from '../../../../components/form-dialog';
import { mciText, sendMci } from '../../../../lib/mci-labels';

export type SettingKind = 'zones' | 'triage' | 'statuses' | 'professions';
export interface SettingRow { id: string; name: string; sortOrder: number; isActive: boolean; description?: string; colorHex?: string; positionIds?: string[] }

const kindNames: Record<SettingKind, string> = { zones: 'จุด', triage: 'สีคัดกรอง', statuses: 'สถานะผู้ป่วย', professions: 'สายวิชาชีพ' };

/** Adds (no `row`) or edits one row of จุด, สีคัดกรอง, สถานะ or สายวิชาชีพ. สีคัดกรอง adds a colour and its meaning; สายวิชาชีพ the HR positions that map to it. */
export function SettingRowForm({ kind, row, positions = [], nextSortOrder = 10 }: { kind: SettingKind; row?: SettingRow; positions?: ReadonlyArray<{ id: string; name: string }>; nextSortOrder?: number }) {
  const router = useRouter();
  const ids = useId();
  const blank = () => ({ name: row?.name ?? '', sortOrder: String(row?.sortOrder ?? nextSortOrder), isActive: row?.isActive ?? true, description: row?.description ?? '', colorHex: row?.colorHex ?? '#6B7280', positionIds: row?.positionIds ?? [] });
  const [values, setValues] = useState(blank);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<ReturnType<typeof blank>>) => setValues((current) => ({ ...current, ...patch }));
  const sortOrder = Number(values.sortOrder);
  const ready = values.name.trim() !== '' && Number.isInteger(sortOrder) && sortOrder >= 0 && sortOrder <= 999 && (kind !== 'triage' || /^#[0-9A-Fa-f]{6}$/.test(values.colorHex));
  async function submit(): Promise<boolean> {
    setError(null);
    const body = {
      name: values.name.trim(), sortOrder, isActive: values.isActive,
      ...(kind === 'triage' ? { description: values.description.trim(), colorHex: values.colorHex.toUpperCase() } : {}),
      ...(kind === 'professions' ? { positionIds: values.positionIds } : {})
    };
    const { error: failure } = await sendMci(row ? `/api/mci/settings/${kind}/${encodeURIComponent(row.id)}` : `/api/mci/settings/${kind}`, row ? 'PUT' : 'POST', body);
    if (failure) { setError(failure); return false; }
    router.refresh();
    return true;
  }
  const title = row ? `แก้ไข${kindNames[kind]} ${row.name}` : `เพิ่ม${kindNames[kind]}`;
  return <FormDialog title={title} triggerLabel={row ? 'แก้ไข' : `เพิ่ม${kindNames[kind]}`} triggerAriaLabel={title} triggerClassName={row ? 'button-secondary' : undefined} submitLabel={mciText.save} wide={kind === 'professions'} ready={ready} error={error}
    onOpenChange={(open) => { if (open) { setError(null); setValues(blank()); } }} onSubmit={submit}>
    <div className="mci-form-grid">
      <label htmlFor={`${ids}-name`}>ชื่อ</label>
      <input id={`${ids}-name`} value={values.name} maxLength={80} required onChange={(event) => set({ name: event.target.value })} />
      {kind === 'triage' && <>
        <label htmlFor={`${ids}-color`}>สี</label>
        <input id={`${ids}-color`} type="color" value={values.colorHex} onChange={(event) => set({ colorHex: event.target.value })} />
        <label htmlFor={`${ids}-description`}>ความหมาย</label>
        <input id={`${ids}-description`} value={values.description} maxLength={120} onChange={(event) => set({ description: event.target.value })} />
      </>}
      <label htmlFor={`${ids}-order`}>ลำดับ</label>
      <input id={`${ids}-order`} type="number" inputMode="numeric" min={0} max={999} step={1} value={values.sortOrder} required onChange={(event) => set({ sortOrder: event.target.value })} />
    </div>
    <label><input type="checkbox" checked={values.isActive} onChange={(event) => set({ isActive: event.target.checked })} /> เปิดใช้</label>
    {kind === 'professions' && <fieldset className="mci-position-picks">
      <legend>ตำแหน่งใน HR ที่นับเป็นสายวิชาชีพนี้ (ตำแหน่งหนึ่งอยู่ได้สายเดียว)</legend>
      {positions.map((position) => <label key={position.id}>
        <input type="checkbox" checked={values.positionIds.includes(position.id)}
          onChange={(event) => set({ positionIds: event.target.checked ? [...values.positionIds, position.id] : values.positionIds.filter((positionId) => positionId !== position.id) })} /> {position.name}
      </label>)}
    </fieldset>}
  </FormDialog>;
}

/** กฎจัดจุด: the จุด each สายวิชาชีพ goes to on รายงานตัว; "รอจัดจุด" leaves them for a หัวหน้าจุด to place. */
export function RulesForm({ professions, zones, rules }: { professions: ReadonlyArray<{ id: string; name: string }>; zones: ReadonlyArray<{ id: string; name: string }>; rules: ReadonlyArray<{ professionId: string; zoneId: string | null }> }) {
  const router = useRouter();
  const ids = useId();
  const blank = () => Object.fromEntries(professions.map((profession) => [profession.id, rules.find((rule) => rule.professionId === profession.id)?.zoneId ?? '']));
  const [chosen, setChosen] = useState<Record<string, string>>(blank);
  const [error, setError] = useState<string | null>(null);
  async function submit(): Promise<boolean> {
    setError(null);
    const { error: failure } = await sendMci('/api/mci/settings/rules', 'PUT', { rules: professions.map((profession) => ({ professionId: profession.id, zoneId: chosen[profession.id] || null })) });
    if (failure) { setError(failure); return false; }
    router.refresh();
    return true;
  }
  return <FormDialog title="แก้ไขกฎจัดจุด" triggerLabel="แก้ไขกฎจัดจุด" submitLabel={mciText.save} error={error} onOpenChange={(open) => { if (open) { setError(null); setChosen(blank()); } }} onSubmit={submit}>
    <div className="mci-form-grid">
      {professions.map((profession) => <span key={profession.id} className="mci-form-pair">
        <label htmlFor={`${ids}-${profession.id}`}>{profession.name}</label>
        <select id={`${ids}-${profession.id}`} value={chosen[profession.id] ?? ''} onChange={(event) => setChosen((current) => ({ ...current, [profession.id]: event.target.value }))}>
          <option value="">{mciText.waitingZone}</option>
          {zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}
        </select>
      </span>)}
    </div>
  </FormDialog>;
}

/** เบอร์จุดประชาสัมพันธ์ shown on the public board. */
export function ContactForm({ phone }: { phone: string }) {
  const router = useRouter();
  const ids = useId();
  const [value, setValue] = useState(phone);
  const [error, setError] = useState<string | null>(null);
  async function submit(): Promise<boolean> {
    setError(null);
    const { error: failure } = await sendMci('/api/mci/settings/contact', 'PUT', { publicContactPhone: value.trim() });
    if (failure) { setError(failure); return false; }
    router.refresh();
    return true;
  }
  return <FormDialog title="เบอร์จุดประชาสัมพันธ์" triggerLabel="แก้ไขเบอร์ติดต่อ" submitLabel={mciText.save} error={error} onOpenChange={(open) => { if (open) { setError(null); setValue(phone); } }} onSubmit={submit}>
    <label htmlFor={`${ids}-phone`}>เบอร์โทรที่แสดงบนกระดานสาธารณะ</label>
    <input id={`${ids}-phone`} type="tel" value={value} maxLength={40} onChange={(event) => setValue(event.target.value)} />
  </FormDialog>;
}
