'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { t } from '@backoffice/i18n';
import { ActionDialog } from '../../../../../components/action-dialog';
import { roomErrorMessage } from '../../room-display';

/** `cancelAction`: `cancel` before the booking starts, `release` once it is under way, `null` when the viewer may not cancel. */
type BookingDialog = { title: string; path: 'decision' | 'cancellation'; body: Record<string, string>; reason: boolean; danger: boolean };

export function BookingActions({ bookingId, canDecide, cancelAction, cancelByAdmin = false }: { bookingId: string; canDecide: boolean; cancelAction: 'cancel' | 'release' | null; cancelByAdmin?: boolean }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<BookingDialog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(current: BookingDialog, reason: string) {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/rooms/bookings/${encodeURIComponent(bookingId)}/${current.path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(current.reason ? { ...current.body, reason } : current.body) });
      if (response.ok) { setDialog(null); router.refresh(); return; }
      setError(roomErrorMessage(((await response.json()) as { error?: string }).error));
    } catch { setError(t('roomActionFailed')); } finally { setBusy(false); }
  }

  if (!canDecide && !cancelAction) return null;
  const cancelLabel = cancelAction === 'release' ? t('releaseRemainingDays') : cancelByAdmin ? t('cancelBookingByAdmin') : t('cancelBooking');
  const open = (next: BookingDialog) => { setError(null); setDialog(next); };
  return <section className="request-actions">
    {canDecide && <button type="button" disabled={busy} onClick={() => open({ title: t('approveBooking'), path: 'decision', body: { decision: 'APPROVE' }, reason: false, danger: false })}>{t('approveBooking')}</button>}
    {canDecide && <button type="button" className="button-danger" disabled={busy} onClick={() => open({ title: t('rejectBooking'), path: 'decision', body: { decision: 'REJECT' }, reason: true, danger: true })}>{t('rejectBooking')}</button>}
    {cancelAction && <button type="button" className="button-danger" disabled={busy} onClick={() => open({ title: cancelLabel, path: 'cancellation', body: {}, reason: true, danger: true })}>{cancelLabel}</button>}
    {dialog && <ActionDialog title={dialog.title} message={dialog.reason ? undefined : t('dialogConfirmQuestion')} confirmLabel={t('confirmAction')} tone={dialog.danger ? 'danger' : 'primary'} reason={dialog.reason} isSubmitting={busy} error={error} onConfirm={(reason) => void send(dialog, reason)} onClose={() => { setDialog(null); setError(null); }} />}
  </section>;
}
