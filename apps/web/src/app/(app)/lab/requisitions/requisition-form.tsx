'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FormDialog } from '../../../../components/form-dialog';
import { sendLab } from '../../../../lib/lab-client';

type Line = { key: number; itemId: string; quantity: string };
let nextKey = 1;
export interface RequisitionValues { id: string; sectionId: string; note: string; lines: { itemId: string; quantity: number }[] }

/** ใบขอเบิก from คลังหลัก into a งาน, in usage units; `requisition` re-sends one that was ส่งกลับแก้ไข. */
export function RequisitionForm({ sections, items, requisition, disabled = false }: {
  sections: ReadonlyArray<{ id: string; name: string }>;
  items: ReadonlyArray<{ id: string; code: string; name: string; useUnit: string }>;
  requisition?: RequisitionValues; disabled?: boolean;
}) {
  const router = useRouter();
  const ids = useId();
  const start = () => ({
    sectionId: requisition?.sectionId ?? (sections.length === 1 ? sections[0]!.id : ''), note: requisition?.note ?? '',
    lines: requisition ? requisition.lines.map((line) => ({ key: nextKey++, itemId: line.itemId, quantity: String(line.quantity) })) : [{ key: nextKey++, itemId: '', quantity: '' }]
  });
  const [values, setValues] = useState(start);
  const [error, setError] = useState<string | null>(null);
  const setLine = (key: number, change: Partial<Line>) => setValues((current) => ({ ...current, lines: current.lines.map((line) => (line.key === key ? { ...line, ...change } : line)) }));
  const unique = new Set(values.lines.map((line) => line.itemId)).size === values.lines.length;
  const ready = Boolean(values.sectionId) && unique && values.lines.every((line) => line.itemId && Number.isInteger(Number(line.quantity)) && Number(line.quantity) > 0);
  const title = requisition ? 'แก้ไขและส่งใบขอเบิกอีกครั้ง' : 'ขอเบิกวัสดุ';

  async function submit(): Promise<boolean> {
    setError(null);
    const body = { sectionId: values.sectionId, note: values.note.trim(), lines: values.lines.map((line) => ({ itemId: line.itemId, quantity: Number(line.quantity) })) };
    const { error: failure } = requisition ? await sendLab(`/api/lab/requisitions/${encodeURIComponent(requisition.id)}`, 'PUT', body) : await sendLab('/api/lab/requisitions', 'POST', body);
    if (failure) { setError(failure); return false; }
    router.refresh();
    return true;
  }

  return <FormDialog title={title} triggerLabel={requisition ? 'แก้ไขและส่งอีกครั้ง' : 'ขอเบิก'} triggerDisabled={disabled} submitLabel="ส่งใบขอเบิก" wide ready={ready} error={error}
    onOpenChange={(open) => { if (open) { setError(null); setValues(start()); } }} onSubmit={submit}>
    <div className="lab-form-grid">
      <label htmlFor={`${ids}-section`}>งานที่ขอ</label>
      <select id={`${ids}-section`} value={values.sectionId} required disabled={Boolean(requisition)} onChange={(event) => setValues((current) => ({ ...current, sectionId: event.target.value }))}>
        {sections.length !== 1 && <option value="">เลือกงาน</option>}
        {sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}
      </select>
    </div>
    {values.lines.map((line, index) => {
      const item = items.find((entry) => entry.id === line.itemId);
      return <div key={line.key} className="lab-request-line">
        <label htmlFor={`${ids}-${line.key}-item`}>วัสดุ แถว {index + 1}</label>
        <select id={`${ids}-${line.key}-item`} value={line.itemId} required onChange={(event) => setLine(line.key, { itemId: event.target.value })}>
          <option value="">เลือกวัสดุ</option>
          {items.map((entry) => <option key={entry.id} value={entry.id}>{entry.code} {entry.name}</option>)}
        </select>
        <label htmlFor={`${ids}-${line.key}-quantity`}>จำนวน{item ? ` (${item.useUnit})` : ''}</label>
        <input id={`${ids}-${line.key}-quantity`} type="number" inputMode="numeric" min={1} step={1} value={line.quantity} required onChange={(event) => setLine(line.key, { quantity: event.target.value })} />
        {values.lines.length > 1 && <button type="button" className="button-secondary" onClick={() => setValues((current) => ({ ...current, lines: current.lines.filter((entry) => entry.key !== line.key) }))}>ลบแถว {index + 1}</button>}
      </div>;
    })}
    {!unique && <p role="alert" className="form-error">วัสดุแต่ละรายการขอได้แถวเดียว</p>}
    <button type="button" className="button-secondary" disabled={values.lines.length >= 100} onClick={() => setValues((current) => ({ ...current, lines: [...current.lines, { key: nextKey++, itemId: '', quantity: '' }] }))}>เพิ่มแถว</button>
    <div className="action-dialog-field">
      <label htmlFor={`${ids}-note`}>หมายเหตุ</label>
      <textarea id={`${ids}-note`} rows={2} maxLength={500} value={values.note} onChange={(event) => setValues((current) => ({ ...current, note: event.target.value }))} />
    </div>
  </FormDialog>;
}
