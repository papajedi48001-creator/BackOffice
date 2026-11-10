'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ActionDialog } from '../../../../../components/action-dialog';
import { sendLab } from '../../../../../lib/lab-client';

/** ยกเลิกใบรับ with a reason; refused once any of its lots has been issued or used. */
export function VoidReceiptButton({ receiptId, docNo }: { receiptId: string; docNo: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function confirm(reason: string) {
    setBusy(true); setError(null);
    const { error: failure } = await sendLab(`/api/lab/receipts/${encodeURIComponent(receiptId)}/void`, 'POST', { reason });
    setBusy(false);
    if (failure) { setError(failure); return; }
    setOpen(false);
    router.refresh();
  }
  return <>
    <button type="button" className="button-danger" onClick={() => { setError(null); setOpen(true); }}>ยกเลิกใบรับ</button>
    {open && <ActionDialog title="ยกเลิกใบรับ" message={`${docNo} ยอดของทุกล็อตในใบนี้จะถูกหักออกจากคลังหลัก`} confirmLabel="ยืนยันยกเลิก" tone="danger" reason isSubmitting={busy} error={error} onConfirm={(reason) => void confirm(reason)} onClose={() => setOpen(false)} />}
  </>;
}
