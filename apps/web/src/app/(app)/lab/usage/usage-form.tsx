'use client';

import { useEffect, useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FormDialog } from '../../../../components/form-dialog';
import { ThaiDateInput } from '../../../../components/thai-date-input';
import { formatBangkokDateOnly } from '../../../../lib/bangkok-time';
import { formatCount, previewFefo, sendLab, type LabLot } from '../../../../lib/lab-client';

export interface UsageFormProps {
  stores: ReadonlyArray<{ id: string; name: string }>;
  items: ReadonlyArray<{ id: string; code: string; name: string; useUnit: string }>;
  usageTypes: ReadonlyArray<{ id: string; name: string }>;
  today: string;
  disabled?: boolean;
  /** The large ตัดใช้ button on ภาพรวม. */
  large?: boolean;
}

/**
 * ตัดใช้ from a คลังย่อย. The งาน is chosen for the person when they have only one. The lots the server will take (หมดอายุก่อนใช้ก่อน)
 * show as a preview; "เปลี่ยนล็อต" lets them split by hand instead (`picks`). The server picks and checks again under lock.
 */
export function UsageForm({ stores, items, usageTypes, today, disabled = false, large = false }: UsageFormProps) {
  const router = useRouter();
  const ids = useId();
  const blank = () => ({ storeId: stores.length === 1 ? stores[0]!.id : '', itemId: '', quantity: '', usageTypeId: usageTypes.length === 1 ? usageTypes[0]!.id : '', entryDate: today, note: '' });
  const [values, setValues] = useState(blank);
  const [lots, setLots] = useState<LabLot[] | null>(null);
  const [manual, setManual] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof ReturnType<typeof blank>, value: string) => setValues((current) => ({ ...current, [key]: value }));
  const item = items.find((entry) => entry.id === values.itemId);
  const quantity = Number(values.quantity);

  useEffect(() => {
    setLots(null);
    setManual(null);
    if (!values.storeId || !values.itemId) return;
    let current = true;
    void fetch(`/api/lab/stock/${encodeURIComponent(values.itemId)}/lots?store=${encodeURIComponent(values.storeId)}`)
      .then(async (response) => { if (current && response.ok) setLots(((await response.json()) as { lots: LabLot[] }).lots); })
      .catch(() => undefined);
    return () => { current = false; };
  }, [values.storeId, values.itemId]);

  const usable = (lots ?? []).filter((lot) => lot.expiryDate === null || lot.expiryDate >= values.entryDate);
  const preview = lots && quantity > 0 ? previewFefo(lots, quantity, values.entryDate) : null;
  const manualPicks = manual ? Object.entries(manual).map(([lotId, text]) => ({ lotId, quantity: Number(text) })).filter((pick) => Number.isInteger(pick.quantity) && pick.quantity > 0) : null;
  const manualTotal = manualPicks?.reduce((sum, pick) => sum + pick.quantity, 0) ?? 0;
  const ready = Boolean(values.storeId && values.itemId && values.usageTypeId && values.entryDate) && Number.isInteger(quantity) && quantity > 0
    && (manualPicks ? manualTotal === quantity : (preview?.short ?? 0) === 0);
  const lotLabel = (lot: LabLot) => `${lot.lotNo}${lot.expiryDate ? ` หมดอายุ ${formatBangkokDateOnly(lot.expiryDate)}` : ' ไม่มีวันหมดอายุ'}`;

  async function submit(): Promise<boolean> {
    setError(null);
    const { error: failure } = await sendLab('/api/lab/usages', 'POST', { storeId: values.storeId, itemId: values.itemId, quantity, usageTypeId: values.usageTypeId, entryDate: values.entryDate, note: values.note.trim(), picks: manualPicks && manualPicks.length > 0 ? manualPicks : null });
    if (failure) { setError(failure); return false; }
    router.refresh();
    return true;
  }

  return <FormDialog title="ตัดใช้วัสดุ" triggerLabel="ตัดใช้" triggerClassName={large ? 'lab-primary-action' : undefined} triggerDisabled={disabled} submitLabel="บันทึกการตัดใช้" wide ready={ready} error={error}
    onOpenChange={(open) => { if (open) { setError(null); setValues(blank()); } }} onSubmit={submit}>
    <div className="lab-form-grid">
      <label htmlFor={`${ids}-store`}>งาน</label>
      <select id={`${ids}-store`} value={values.storeId} required onChange={(event) => set('storeId', event.target.value)}>
        {stores.length !== 1 && <option value="">เลือกงาน</option>}
        {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
      </select>
      <label htmlFor={`${ids}-item`}>วัสดุ</label>
      <select id={`${ids}-item`} value={values.itemId} required onChange={(event) => set('itemId', event.target.value)}>
        <option value="">เลือกวัสดุ</option>
        {items.map((entry) => <option key={entry.id} value={entry.id}>{entry.code} {entry.name}</option>)}
      </select>
      <label htmlFor={`${ids}-quantity`}>จำนวน{item ? ` (${item.useUnit})` : ''}</label>
      <input id={`${ids}-quantity`} type="number" inputMode="numeric" min={1} step={1} value={values.quantity} required onChange={(event) => set('quantity', event.target.value)} />
      <label htmlFor={`${ids}-type`}>ประเภทการใช้</label>
      <select id={`${ids}-type`} value={values.usageTypeId} required onChange={(event) => set('usageTypeId', event.target.value)}>
        {usageTypes.length !== 1 && <option value="">เลือกประเภท</option>}
        {usageTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
      </select>
      <label htmlFor={`${ids}-date`}>วันที่ใช้</label>
      <ThaiDateInput id={`${ids}-date`} value={values.entryDate} max={today} required onChange={(value) => set('entryDate', value)} />
      <label htmlFor={`${ids}-note`}>หมายเหตุ</label>
      <input id={`${ids}-note`} value={values.note} maxLength={500} onChange={(event) => set('note', event.target.value)} />
    </div>
    {lots && usable.length === 0 && <p role="alert" className="form-error">งานนี้ไม่มีวัสดุนี้คงเหลือ</p>}
    {!manual && preview && <>
      <p className="lab-hint">ล็อตที่จะตัด (หมดอายุก่อนใช้ก่อน)</p>
      <ul className="lab-lot-list" aria-label="ล็อตที่จะตัด (หมดอายุก่อนใช้ก่อน)">
        {preview.picks.map((pick) => { const lot = lots!.find((entry) => entry.lotId === pick.lotId)!; return <li key={pick.lotId}>{lotLabel(lot)}: {formatCount(pick.quantity)} {item?.useUnit}</li>; })}
      </ul>
      {preview.short > 0 && <p role="alert" className="form-error">ยอดคงเหลือไม่พอ ขาดอีก {formatCount(preview.short)} {item?.useUnit}</p>}
    </>}
    {lots && usable.length > 0 && !manual && <button type="button" className="button-secondary" onClick={() => setManual(Object.fromEntries((preview?.picks ?? []).map((pick) => [pick.lotId, String(pick.quantity)])))}>เปลี่ยนล็อต</button>}
    {manual && <fieldset className="lab-lot-editor">
      <legend>เลือกล็อตเอง (รวม {formatCount(manualTotal)} จาก {formatCount(quantity || 0)})</legend>
      {usable.map((lot) => <div key={lot.lotId} className="lab-lot-row">
        <label htmlFor={`${ids}-lot-${lot.lotId}`}>{lotLabel(lot)} (คงเหลือ {formatCount(lot.quantity)})</label>
        <input id={`${ids}-lot-${lot.lotId}`} type="number" inputMode="numeric" min={0} max={lot.quantity} step={1} value={manual[lot.lotId] ?? ''} onChange={(event) => setManual((current) => ({ ...current, [lot.lotId]: event.target.value }))} />
      </div>)}
      {manualTotal !== quantity && <p role="alert" className="form-error">จำนวนรวมของล็อตต้องเท่ากับจำนวนที่ตัดใช้</p>}
      <button type="button" className="button-secondary" onClick={() => setManual(null)}>ใช้ตามลำดับหมดอายุ</button>
    </fieldset>}
  </FormDialog>;
}
