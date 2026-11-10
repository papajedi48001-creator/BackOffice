'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ActionDialog } from '../../../../components/action-dialog';
import { sendLab } from '../../../../lib/lab-client';

/** ยกเลิกการตัดใช้ with a reason; the stock goes back to the same lots. */
export function ReverseUsageButton({ usageId, label }: { usageId: string; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function confirm(reason: string) {
    setBusy(true); setError(null);
    const { error: failure } = await sendLab(`/api/lab/usages/${encodeURIComponent(usageId)}/reversal`, 'POST', { reason });
    setBusy(false);
    if (failure) { setError(failure); return; }
    setOpen(false);
    router.refresh();
  }
  return <>
    <button type="button" className="button-secondary" aria-label={`ยกเลิกการตัดใช้ ${label}`} onClick={() => { setError(null); setOpen(true); }}>ยกเลิก</button>
    {open && <ActionDialog title="ยกเลิกการตัดใช้" message={`${label} จะคืนยอดเข้าล็อตเดิม`} confirmLabel="ยืนยันยกเลิก" tone="danger" reason isSubmitting={busy} error={error} onConfirm={(reason) => void confirm(reason)} onClose={() => setOpen(false)} />}
  </>;
}
