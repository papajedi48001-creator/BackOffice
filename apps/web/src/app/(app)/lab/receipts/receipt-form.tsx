'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FormDialog } from '../../../../components/form-dialog';
import { ThaiDateInput } from '../../../../components/thai-date-input';
import { formatBaht, formatCount, sendLab } from '../../../../lib/lab-client';

export interface ReceiptItem { id: string; code: string; name: string; receiveUnit: string; useUnit: string; unitsPerReceive: number }
type Line = { key: number; itemId: string; lotNo: string; expiryDate: string; quantity: string; price: string };

let nextKey = 1;
const emptyLine = (): Line => ({ key: nextKey++, itemId: '', lotNo: '', expiryDate: '', quantity: '', price: '' });
const twoDecimals = (text: string) => /^\d+(\.\d{1,2})?$/.test(text.trim());

/** รับเข้าคลังหลัก (ผู้ดูแลคลัง Lab): one ผู้ขาย and invoice, one line per lot. Shows the usage units and value as the keeper types. */
export function ReceiptForm({ vendors, items, today, disabled = false }: { vendors: ReadonlyArray<{ id: string; name: string }>; items: readonly ReceiptItem[]; today: string; disabled?: boolean }) {
  const router = useRouter();
  const ids = useId();
  const [receivedOn, setReceivedOn] = useState(today);
  const [vendorId, setVendorId] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [lines, setLines] = useState<Line[]>(() => [emptyLine()]);
  const [error, setError] = useState<string | null>(null);
  const reset = () => { setReceivedOn(today); setVendorId(''); setInvoiceNo(''); setLines([emptyLine()]); setError(null); };
  const update = (key: number, field: keyof Omit<Line, 'key'>, value: string) => setLines((current) => current.map((line) => (line.key === key ? { ...line, [field]: value } : line)));
  const lineValue = (line: Line) => (Number(line.quantity) || 0) * (Number(line.price) || 0);
  const total = lines.reduce((sum, line) => sum + lineValue(line), 0);
  const ready = Boolean(receivedOn && vendorId) && lines.length > 0 && lines.every((line) => line.itemId && line.lotNo.trim() && Number.isInteger(Number(line.quantity)) && Number(line.quantity) > 0 && twoDecimals(line.price))
    && new Set(lines.map((line) => `${line.itemId}|${line.lotNo.trim()}|${line.expiryDate}|${line.price}`)).size === lines.length;

  async function submit(): Promise<boolean> {
    setError(null);
    const body = { receivedOn, vendorId, invoiceNo: invoiceNo.trim(), lines: lines.map((line) => ({ itemId: line.itemId, lotNo: line.lotNo.trim(), expiryDate: line.expiryDate || null, quantityReceive: Number(line.quantity), pricePerReceive: Number(line.price) })) };
    const { error: failure } = await sendLab('/api/lab/receipts', 'POST', body);
    if (failure) { setError(failure); return false; }
    router.refresh();
    return true;
  }

  return <FormDialog title="รับวัสดุเข้าคลังหลัก" triggerLabel="รับเข้า" triggerDisabled={disabled} submitLabel="บันทึกการรับ" wide ready={ready} error={error}
    onOpenChange={(open) => { if (open) reset(); }} onSubmit={submit}>
    <div className="lab-form-grid">
      <label htmlFor={`${ids}-date`}>วันที่รับ</label>
      <ThaiDateInput id={`${ids}-date`} value={receivedOn} max={today} required onChange={setReceivedOn} />
      <label htmlFor={`${ids}-vendor`}>ผู้ขาย</label>
      <select id={`${ids}-vendor`} value={vendorId} required onChange={(event) => setVendorId(event.target.value)}>
        <option value="">เลือกผู้ขาย</option>
        {vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
      </select>
      <label htmlFor={`${ids}-invoice`}>เลขที่ใบส่งของ</label>
      <input id={`${ids}-invoice`} value={invoiceNo} maxLength={60} onChange={(event) => setInvoiceNo(event.target.value)} />
    </div>
    {lines.map((line, index) => {
      const item = items.find((entry) => entry.id === line.itemId);
      const row = index + 1;
      const quantity = Number(line.quantity) || 0;
      return <fieldset key={line.key} className="lab-receipt-line">
        <legend>รายการที่ {row}</legend>
        <div className="lab-form-grid">
          <label htmlFor={`${ids}-${line.key}-item`}>วัสดุ</label>
          <select id={`${ids}-${line.key}-item`} aria-label={`วัสดุ แถว ${row}`} value={line.itemId} required onChange={(event) => update(line.key, 'itemId', event.target.value)}>
            <option value="">เลือกวัสดุ</option>
            {items.map((entry) => <option key={entry.id} value={entry.id}>{entry.code} {entry.name}</option>)}
          </select>
          <label htmlFor={`${ids}-${line.key}-lot`}>เลขล็อต</label>
          <input id={`${ids}-${line.key}-lot`} aria-label={`เลขล็อต แถว ${row}`} value={line.lotNo} maxLength={60} required onChange={(event) => update(line.key, 'lotNo', event.target.value)} />
          <label htmlFor={`${ids}-${line.key}-expiry`}>วันหมดอายุ</label>
          <ThaiDateInput id={`${ids}-${line.key}-expiry`} aria-label={`วันหมดอายุ แถว ${row}`} value={line.expiryDate} min={receivedOn} onChange={(value) => update(line.key, 'expiryDate', value)} />
          <label htmlFor={`${ids}-${line.key}-quantity`}>จำนวน{item ? ` (${item.receiveUnit})` : ''}</label>
          <input id={`${ids}-${line.key}-quantity`} aria-label={`จำนวน (หน่วยรับ) แถว ${row}`} type="number" inputMode="numeric" min={1} step={1} value={line.quantity} required onChange={(event) => update(line.key, 'quantity', event.target.value)} />
          <label htmlFor={`${ids}-${line.key}-price`}>ราคาต่อ{item ? item.receiveUnit : 'หน่วยรับ'} (บาท)</label>
          <input id={`${ids}-${line.key}-price`} aria-label={`ราคาต่อหน่วยรับ แถว ${row}`} type="number" inputMode="decimal" min={0} step="0.01" value={line.price} required onChange={(event) => update(line.key, 'price', event.target.value)} />
        </div>
        <p className="lab-line-summary">
          {item && quantity > 0 && <span>{formatCount(quantity * item.unitsPerReceive)} {item.useUnit}</span>}
          <span>{formatBaht(lineValue(line))}</span>
          {lines.length > 1 && <button type="button" className="button-secondary" onClick={() => setLines((current) => current.filter((entry) => entry.key !== line.key))}>ลบรายการที่ {row}</button>}
        </p>
      </fieldset>;
    })}
    <button type="button" className="button-secondary" disabled={lines.length >= 100} onClick={() => setLines((current) => [...current, emptyLine()])}>เพิ่มรายการ</button>
    <p className="lab-total">รวมทั้งใบ <strong>{formatBaht(total)}</strong></p>
  </FormDialog>;
}
