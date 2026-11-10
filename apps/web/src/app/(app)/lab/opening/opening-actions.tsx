'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ActionDialog } from '../../../../components/action-dialog';
import { FormDialog } from '../../../../components/form-dialog';
import { ThaiDateInput } from '../../../../components/thai-date-input';
import { sendLab } from '../../../../lib/lab-client';

type Step = 'SUBMIT' | 'CERTIFY' | 'RETURN';

/** ส่งรับรอง (ผู้ดูแลคลัง Lab) and รับรอง / ตีกลับ (หัวหน้า Lab); certifying creates the opening stock and opens the module. */
export function OpeningActions({ submit, decide, summary, own = false }: { submit: boolean; decide: boolean; summary: string; own?: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<Step | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function confirm(reason: string) {
    setBusy(true); setError(null);
    const { error: failure } = step === 'SUBMIT' ? await sendLab('/api/lab/opening/submission', 'POST') : await sendLab('/api/lab/opening/decision', 'POST', { decision: step, reason });
    setBusy(false);
    if (failure) { setError(failure); return; }
    setStep(null);
    router.refresh();
  }
  const open = (next: Step) => { setError(null); setStep(next); };
  return <div className="request-actions">
    {submit && <button type="button" onClick={() => open('SUBMIT')}>ส่งรับรอง</button>}
    {decide && <><button type="button" onClick={() => open('CERTIFY')}>รับรองยอดยกมา</button><button type="button" className="button-secondary" onClick={() => open('RETURN')}>ตีกลับ</button></>}
    {step === 'SUBMIT' && <ActionDialog title="ส่งยอดยกมาให้หัวหน้า Lab รับรอง" message={`${summary} ระหว่างรอรับรองแก้ยอดยกมาไม่ได้`} confirmLabel="ส่งรับรอง" isSubmitting={busy} error={error} onConfirm={(reason) => void confirm(reason)} onClose={() => setStep(null)} />}
    {step === 'CERTIFY' && <ActionDialog title="รับรองยอดยกมา" message={`${summary} รับรองแล้วระบบเริ่มใช้งานและแก้ยอดยกมาไม่ได้อีก${own ? ' คุณเป็นผู้ส่งเอง ต้องระบุเหตุผล' : ''}`} confirmLabel="รับรอง" reason={own} isSubmitting={busy} error={error} onConfirm={(reason) => void confirm(reason)} onClose={() => setStep(null)} />}
    {step === 'RETURN' && <ActionDialog title="ตีกลับยอดยกมา" message="ผู้ดูแลคลัง Lab จะแก้แล้วส่งใหม่" confirmLabel="ตีกลับ" reason isSubmitting={busy} error={error} onConfirm={(reason) => void confirm(reason)} onClose={() => setStep(null)} />}
  </div>;
}

export interface OpeningLineValues { id: string; storeId: string; itemId: string; lotNo: string; expiryDate: string | null; quantity: number; unitCost: string }

/** Adds or edits one draft ยอดยกมา row by hand. */
export function OpeningLineForm({ stores, items, line }: { stores: ReadonlyArray<{ id: string; name: string }>; items: ReadonlyArray<{ id: string; code: string; name: string; useUnit: string }>; line?: OpeningLineValues }) {
  const router = useRouter();
  const ids = useId();
  const start = () => ({ storeId: line?.storeId ?? '', itemId: line?.itemId ?? '', lotNo: line?.lotNo ?? '', expiryDate: line?.expiryDate ?? '', quantity: line ? String(line.quantity) : '', unitCost: line ? String(Number(line.unitCost)) : '' });
  const [values, setValues] = useState(start);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof ReturnType<typeof start>, value: string) => setValues((current) => ({ ...current, [key]: value }));
  const item = items.find((entry) => entry.id === values.itemId);
  const ready = Boolean(values.storeId && values.itemId && values.lotNo.trim()) && Number.isInteger(Number(values.quantity)) && Number(values.quantity) > 0 && values.unitCost.trim() !== '' && Number(values.unitCost) >= 0;
  async function submit(): Promise<boolean> {
    setError(null);
    const body = { storeId: values.storeId, itemId: values.itemId, lotNo: values.lotNo.trim(), expiryDate: values.expiryDate || null, quantity: Number(values.quantity), unitCost: Number(values.unitCost) };
    const { error: failure } = line ? await sendLab(`/api/lab/opening/lines/${encodeURIComponent(line.id)}`, 'PUT', body) : await sendLab('/api/lab/opening/lines', 'POST', body);
    if (failure) { setError(failure); return false; }
    router.refresh();
    return true;
  }
  return <FormDialog title={line ? `แก้ไขแถว ${line.lotNo}` : 'เพิ่มแถวยอดยกมา'} triggerLabel={line ? 'แก้ไข' : 'เพิ่มแถว'} triggerClassName={line ? 'button-secondary' : undefined} submitLabel="บันทึก" ready={ready} error={error}
    onOpenChange={(open) => { if (open) { setError(null); setValues(start()); } }} onSubmit={submit}>
    <div className="lab-form-grid">
      <label htmlFor={`${ids}-store`}>คลัง</label>
      <select id={`${ids}-store`} value={values.storeId} required onChange={(event) => set('storeId', event.target.value)}><option value="">เลือกคลัง</option>{stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select>
      <label htmlFor={`${ids}-item`}>วัสดุ</label>
      <select id={`${ids}-item`} value={values.itemId} required onChange={(event) => set('itemId', event.target.value)}><option value="">เลือกวัสดุ</option>{items.map((entry) => <option key={entry.id} value={entry.id}>{entry.code} {entry.name}</option>)}</select>
      <label htmlFor={`${ids}-lot`}>เลขล็อต</label>
      <input id={`${ids}-lot`} value={values.lotNo} maxLength={60} required onChange={(event) => set('lotNo', event.target.value)} />
      <label htmlFor={`${ids}-expiry`}>วันหมดอายุ</label>
      <ThaiDateInput id={`${ids}-expiry`} value={values.expiryDate} onChange={(value) => set('expiryDate', value)} />
      <label htmlFor={`${ids}-quantity`}>จำนวน{item ? ` (${item.useUnit})` : ' (หน่วยใช้)'}</label>
      <input id={`${ids}-quantity`} type="number" inputMode="numeric" min={1} step={1} value={values.quantity} required onChange={(event) => set('quantity', event.target.value)} />
      <label htmlFor={`${ids}-cost`}>ต้นทุนต่อหน่วยใช้ (บาท)</label>
      <input id={`${ids}-cost`} type="number" inputMode="decimal" min={0} step="0.0001" value={values.unitCost} required onChange={(event) => set('unitCost', event.target.value)} />
    </div>
  </FormDialog>;
}

/** ลบแถว after an ActionDialog confirmation. */
export function DeleteOpeningLine({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function confirm() {
    setBusy(true); setError(null);
    const { error: failure } = await sendLab(`/api/lab/opening/lines/${encodeURIComponent(id)}`, 'DELETE');
    setBusy(false);
    if (failure) { setError(failure); return; }
    setOpen(false);
    router.refresh();
  }
  return <>
    <button type="button" className="button-danger" aria-label={`ลบ ${label}`} onClick={() => { setError(null); setOpen(true); }}>ลบ</button>
    {open && <ActionDialog title="ลบแถวยอดยกมา" message={label} confirmLabel="ลบ" tone="danger" isSubmitting={busy} error={error} onConfirm={() => void confirm()} onClose={() => setOpen(false)} />}
  </>;
}
