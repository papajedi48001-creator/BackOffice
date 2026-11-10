'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ActionDialog } from '../../../../components/action-dialog';
import { mciText, sendMci } from '../../../../lib/mci-labels';

/** รายงานตัว: a popup to confirm the สายวิชาชีพ (prefilled from the HR position), then the check-in. */
export function CheckInButton({ professions, defaultProfessionId, disabled = false }: { professions: ReadonlyArray<{ id: string; name: string }>; defaultProfessionId: string | null; disabled?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [professionId, setProfessionId] = useState(defaultProfessionId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldId = useId();
  async function confirm() {
    setBusy(true); setError(null);
    const { error: failure } = await sendMci('/api/mci/check-in', 'POST', { professionId });
    setBusy(false);
    if (failure) { setError(failure); return; }
    setOpen(false);
    router.refresh();
  }
  return <>
    <button type="button" className="mci-check-in" disabled={disabled} onClick={() => { setError(null); setOpen(true); }}>{mciText.checkIn}</button>
    {open && <ActionDialog title={mciText.checkInTitle} message={mciText.checkInMessage} confirmLabel={mciText.checkInConfirm} isSubmitting={busy} error={error} ready={professionId !== ''}
      onConfirm={() => void confirm()} onClose={() => setOpen(false)}>
      <div className="action-dialog-field">
        <label htmlFor={fieldId}>{mciText.profession}</label>
        <select id={fieldId} value={professionId} required onChange={(event) => setProfessionId(event.target.value)}>
          <option value="">{mciText.chooseProfession}</option>
          {professions.map((profession) => <option key={profession.id} value={profession.id}>{profession.name}</option>)}
        </select>
      </div>
    </ActionDialog>}
  </>;
}

/** ออกจากเวร for one responder: the person themself, or a ผู้บัญชาการเหตุ / หัวหน้าจุด for someone in their zone. */
export function CheckOutButton({ responderId, label = mciText.checkOut, className = 'button-secondary' }: { responderId: string; label?: string; className?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function confirm() {
    setBusy(true); setError(null);
    const { error: failure } = await sendMci(`/api/mci/responders/${encodeURIComponent(responderId)}/check-out`, 'POST');
    setBusy(false);
    if (failure) { setError(failure); return; }
    setOpen(false);
    router.refresh();
  }
  return <>
    <button type="button" className={className} onClick={() => { setError(null); setOpen(true); }}>{label}</button>
    {open && <ActionDialog title={mciText.checkOutTitle} message={mciText.checkOutMessage} confirmLabel={mciText.checkOutConfirm} tone="danger" isSubmitting={busy} error={error}
      onConfirm={() => void confirm()} onClose={() => setOpen(false)} />}
  </>;
}
