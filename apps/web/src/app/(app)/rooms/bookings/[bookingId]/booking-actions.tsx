'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { t } from '@backoffice/i18n';
import { ActionDialog } from '../../../../../components/action-dialog';
import { roomErrorMessage } from '../../room-display';

/** `url`: the room booking's own decision or cancellation route, or the คำขอ's decisions route for the booker's head. */
type BookingDialog = { title: string; url: string; body: Record<string, string>; reason: boolean; danger: boolean };

/**
 * `cancelAction`: `cancel` before the booking starts, `release` once it is under way, `null` when the viewer may not cancel.
 * `headRequestId`: set when the booking waits on this viewer as the booker's head; they agree or not in คำขอ.
 */
export function BookingActions({ bookingId, canDecide, cancelAction, cancelByAdmin = false, headRequestId = null }: { bookingId: string; canDecide: boolean; cancelAction: 'cancel' | 'release' | null; cancelByAdmin?: boolean; headRequestId?: string | null }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<BookingDialog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(current: BookingDialog, reason: string) {
    setBusy(true); setError(null);
    try {
      const response = await fetch(current.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(current.reason ? { ...current.body, reason } : current.body) });
      if (response.ok) { setDialog(null); router.refresh(); return; }
      setError(roomErrorMessage(((await response.json()) as { error?: string }).error));
    } catch { setError(t('roomActionFailed')); } finally { setBusy(false); }
  }

  if (!canDecide && !cancelAction && !headRequestId) return null;
  const bookingUrl = (path: 'decision' | 'cancellation') => `/api/rooms/bookings/${encodeURIComponent(bookingId)}/${path}`;
  const cancelLabel = cancelAction === 'release' ? t('releaseRemainingDays') : cancelByAdmin ? t('cancelBookingByAdmin') : t('cancelBooking');
  const open = (next: BookingDialog) => { setError(null); setDialog(next); };
  return <section className="request-actions">
    {headRequestId && <button type="button" disabled={busy} onClick={() => open({ title: t('roomHeadApprove'), url: `/api/requests/${encodeURIComponent(headRequestId)}/decisions`, body: { decision: 'APPROVE' }, reason: false, danger: false })}>{t('roomHeadApprove')}</button>}
    {headRequestId && <button type="button" className="button-danger" disabled={busy} onClick={() => open({ title: t('roomHeadReject'), url: `/api/requests/${encodeURIComponent(headRequestId)}/decisions`, body: { decision: 'REJECT' }, reason: true, danger: true })}>{t('roomHeadReject')}</button>}
    {canDecide && <button type="button" disabled={busy} onClick={() => open({ title: t('approveBooking'), url: bookingUrl('decision'), body: { decision: 'APPROVE' }, reason: false, danger: false })}>{t('approveBooking')}</button>}
    {canDecide && <button type="button" className="button-danger" disabled={busy} onClick={() => open({ title: t('rejectBooking'), url: bookingUrl('decision'), body: { decision: 'REJECT' }, reason: true, danger: true })}>{t('rejectBooking')}</button>}
    {cancelAction && <button type="button" className="button-danger" disabled={busy} onClick={() => open({ title: cancelLabel, url: bookingUrl('cancellation'), body: {}, reason: true, danger: true })}>{cancelLabel}</button>}
    {dialog && <ActionDialog title={dialog.title} message={dialog.reason ? undefined : t('dialogConfirmQuestion')} confirmLabel={t('confirmAction')} tone={dialog.danger ? 'danger' : 'primary'} reason={dialog.reason} isSubmitting={busy} error={error} onConfirm={(reason) => void send(dialog, reason)} onClose={() => { setDialog(null); setError(null); }} />}
  </section>;
}
