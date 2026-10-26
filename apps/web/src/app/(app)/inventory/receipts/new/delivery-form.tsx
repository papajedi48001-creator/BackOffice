'use client';

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { InventoryVendorRecord, ScanItem } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { inventoryErrorText } from '../../inventory-errors';
import { ReceiptLinesEditor, toLineInputs, type EditorLine } from '../../receipt-lines-editor';

const draftKey = 'inventory.delivery-draft';
type Draft = { vendorId: string; documentNo: string; receivedOn: string; lines: EditorLine[] };

function readDraft(): Draft | null {
  try {
    const stored = sessionStorage.getItem(draftKey);
    return stored ? JSON.parse(stored) as Draft : null;
  } catch { return null; }
}
function writeDraft(draft: Draft | null) {
  try {
    if (draft) sessionStorage.setItem(draftKey, JSON.stringify(draft)); else sessionStorage.removeItem(draftKey);
  } catch { /* the draft is a convenience; the form still works without storage */ }
}

/** A delivery is posted in one step; until then the form keeps its draft in this browser tab. */
export function DeliveryForm({ vendors, items, today, canBindBarcode }: { vendors: InventoryVendorRecord[]; items: ScanItem[]; today: string; canBindBarcode: boolean }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>({ vendorId: '', documentNo: '', receivedOn: today, lines: [] });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const sending = useRef(false);
  const activeVendors = vendors.filter((vendor) => vendor.isActive);

  useEffect(() => {
    const stored = readDraft();
    if (stored) setDraft(stored);
    setLoaded(true);
  }, []);
  useEffect(() => { if (loaded) writeDraft(draft); }, [draft, loaded]);

  // A keyboard-wedge scanner ends every code with Enter wherever the cursor is; only the button posts the receipt.
  function blockImplicitSubmit(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === 'Enter' && event.target instanceof HTMLInputElement) event.preventDefault();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending.current) return;
    sending.current = true;
    setPending(true);
    setError(null);
    try {
      const body = { vendorId: draft.vendorId, ...(draft.documentNo.trim() ? { documentNo: draft.documentNo.trim() } : {}), receivedOn: draft.receivedOn, lines: toLineInputs(draft.lines) };
      const response = await fetch('/api/inventory/receipts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const json = await response.json().catch(() => ({})) as { id?: string; error?: string };
      if (response.ok && json.id) {
        writeDraft(null);
        setLoaded(false);
        router.push(`/inventory/receipts/${json.id}`);
        return;
      }
      setError(inventoryErrorText(json.error));
    } catch {
      setError(t('inventoryActionFailed'));
    }
    sending.current = false;
    setPending(false);
  }

  return (
    <form className="inventory-form inventory-form-wide" aria-label={t('inventoryReceiptNewTitle')} onSubmit={submit} onKeyDown={blockImplicitSubmit}>
      <div className="form-row">
        <label>{t('inventoryVendors')}<select required value={draft.vendorId} onChange={(event) => setDraft({ ...draft, vendorId: event.target.value })}><option value="">–</option>{activeVendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</select></label>
        <label>{t('inventoryDocumentNo')}<input value={draft.documentNo} maxLength={60} onChange={(event) => setDraft({ ...draft, documentNo: event.target.value })} /></label>
        <label>{t('inventoryReceivedOn')}<input type="date" required max={today} value={draft.receivedOn} onChange={(event) => setDraft({ ...draft, receivedOn: event.target.value })} /></label>
      </div>
      <ReceiptLinesEditor lines={draft.lines} onChange={(lines) => setDraft((current) => ({ ...current, lines }))} items={items} canBindBarcode={canBindBarcode} />
      {error ? <p role="alert">{error}</p> : null}
      <div className="form-actions"><button type="submit" disabled={pending || draft.lines.length === 0}>{pending ? t('inventoryPosting') : t('inventoryPostReceipt')}</button></div>
    </form>
  );
}
