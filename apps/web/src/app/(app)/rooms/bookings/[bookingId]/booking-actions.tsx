'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { t } from '@backoffice/i18n';
import { roomErrorMessage } from '../../room-display';

/** `cancelAction`: `cancel` before the booking starts, `release` once it is under way, `null` when the viewer may not cancel. */
export function BookingActions({ bookingId, canDecide, cancelAction, cancelByAdmin = false }: { bookingId: string; canDecide: boolean; cancelAction: 'cancel' | 'release' | null; cancelByAdmin?: boolean }) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(path: 'decision' | 'cancellation', body: Record<string, string>, needsReason: boolean) {
    if (needsReason && !reason.trim()) { setError(t('reasonRequired')); return; }
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/rooms/bookings/${encodeURIComponent(bookingId)}/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(needsReason ? { ...body, reason: reason.trim() } : body) });
      if (response.ok) { setReason(''); router.refresh(); return; }
      setError(roomErrorMessage(((await response.json()) as { error?: string }).error));
    } catch { setError(t('roomActionFailed')); } finally { setBusy(false); }
  }

  if (!canDecide && !cancelAction) return null;
  const cancelLabel = cancelAction === 'release' ? t('releaseRemainingDays') : cancelByAdmin ? t('cancelBookingByAdmin') : t('cancelBooking');
  return <section className="booking-actions">
    <div className="form-field"><label htmlFor="booking-reason">{t('reasonPrompt')}</label><textarea id="booking-reason" value={reason} maxLength={1000} rows={3} onChange={(event) => setReason(event.target.value)} /></div>
    <div className="form-actions">
      {canDecide && <button type="button" disabled={busy} onClick={() => void send('decision', { decision: 'APPROVE' }, false)}>{t('approveBooking')}</button>}
      {canDecide && <button type="button" className="button-danger" disabled={busy} onClick={() => void send('decision', { decision: 'REJECT' }, true)}>{t('rejectBooking')}</button>}
      {cancelAction && <button type="button" className="button-danger" disabled={busy} onClick={() => void send('cancellation', {}, true)}>{cancelLabel}</button>}
    </div>
    {error && <p role="alert" className="form-error">{error}</p>}
  </section>;
}
