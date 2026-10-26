'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { t } from '@backoffice/i18n';
import { ActionDialog } from '../../../../../components/action-dialog';
import { leaveErrorMessage } from '../../../../../lib/leave-labels';

type Decision = 'APPROVE' | 'RETURN' | 'REJECT';
type LeaveDialog = Decision | 'CANCEL';

/** Decide (current approver), cancel (owner of a pending ใบลา) and ขอยกเลิกวันลา (owner of an approved one). The server re-checks each. */
export function LeaveActions({ requestId, canDecide, canCancel, canRequestCancelDays }: { requestId: string; canDecide: boolean; canCancel: boolean; canRequestCancelDays: boolean }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<LeaveDialog | null>(null);
  const [range, setRange] = useState({ startDate: '', endDate: '', startHalf: 'FULL', endHalf: 'FULL', reason: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const id = encodeURIComponent(requestId);

  async function send(url: string, body: Record<string, string>, onDone: (result: { requestId?: string }) => void) {
    setBusy(true); setError(null);
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const result = (await response.json()) as { error?: string; requestId?: string };
      if (response.ok) { onDone(result); return; }
      setError(leaveErrorMessage(result.error));
    } catch { setError(leaveErrorMessage(null)); } finally { setBusy(false); }
  }

  function confirm(current: LeaveDialog, reason: string) {
    const done = () => { setDialog(null); router.refresh(); };
    if (current === 'CANCEL') void send(`/api/leave/${id}/cancellation`, { reason }, done);
    else void send(`/api/requests/${id}/decisions`, current === 'APPROVE' ? { decision: current } : { decision: current, reason }, done);
  }

  const dialogTitle: Record<LeaveDialog, string> = { APPROVE: t('leaveApprove'), RETURN: t('leaveReturn'), REJECT: t('leaveReject'), CANCEL: t('leaveCancel') };
  const open = (next: LeaveDialog) => { setError(null); setDialog(next); };

  function cancelDays(event: React.FormEvent) {
    event.preventDefault();
    if (!range.reason.trim()) { setError(t('leaveReasonRequired')); return; }
    void send(`/api/leave/${id}/cancel-days`, { ...range, reason: range.reason.trim() }, (result) => router.push(`/leave/requests/${result.requestId}`));
  }

  if (!canDecide && !canCancel && !canRequestCancelDays) return null;
  return <section className="leave-actions">
    {(canDecide || canCancel) && <div className="request-actions">
      {canDecide && <button type="button" disabled={busy} onClick={() => open('APPROVE')}>{t('leaveApprove')}</button>}
      {canDecide && <button type="button" className="button-secondary" disabled={busy} onClick={() => open('RETURN')}>{t('leaveReturn')}</button>}
      {canDecide && <button type="button" className="button-danger" disabled={busy} onClick={() => open('REJECT')}>{t('leaveReject')}</button>}
      {canCancel && <button type="button" className="button-danger" disabled={busy} onClick={() => open('CANCEL')}>{t('leaveCancel')}</button>}
    </div>}
    {dialog && <ActionDialog title={dialogTitle[dialog]} message={dialog === 'APPROVE' ? t('dialogConfirmQuestion') : undefined} confirmLabel={t('confirmAction')} tone={dialog === 'REJECT' || dialog === 'CANCEL' ? 'danger' : 'primary'} reason={dialog !== 'APPROVE'} isSubmitting={busy} error={error} onConfirm={(reason) => confirm(dialog, reason)} onClose={() => { setDialog(null); setError(null); }} />}
    {canRequestCancelDays && <form aria-label={t('leaveCancelDays')} className="reason-form" onSubmit={cancelDays}>
      <h3>{t('leaveCancelDays')}</h3>
      <p className="permission-notice">{t('leaveCancelDaysHelp')}</p>
      <div className="form-row">
        <div className="form-field"><label htmlFor="cancel-start">{t('leaveStartDate')}</label><input id="cancel-start" type="date" value={range.startDate} required onChange={(event) => setRange({ ...range, startDate: event.target.value, endDate: range.endDate || event.target.value })} /></div>
        <div className="form-field"><label htmlFor="cancel-start-half">{t('leaveStartHalf')}</label><select id="cancel-start-half" value={range.startHalf} onChange={(event) => setRange({ ...range, startHalf: event.target.value })}><option value="FULL">{t('leaveHalfFull')}</option><option value="AFTERNOON">{t('leaveHalfAfternoon')}</option></select></div>
      </div>
      <div className="form-row">
        <div className="form-field"><label htmlFor="cancel-end">{t('leaveEndDate')}</label><input id="cancel-end" type="date" value={range.endDate} min={range.startDate || undefined} required onChange={(event) => setRange({ ...range, endDate: event.target.value })} /></div>
        <div className="form-field"><label htmlFor="cancel-end-half">{t('leaveEndHalf')}</label><select id="cancel-end-half" value={range.endHalf} onChange={(event) => setRange({ ...range, endHalf: event.target.value })}><option value="FULL">{t('leaveHalfFull')}</option><option value="MORNING">{t('leaveHalfMorning')}</option></select></div>
      </div>
      <label htmlFor="cancel-reason">{t('leaveCancelDaysReason')}</label>
      <textarea id="cancel-reason" value={range.reason} maxLength={1000} rows={2} onChange={(event) => setRange({ ...range, reason: event.target.value })} />
      <div className="form-actions"><button type="submit" disabled={busy}>{t('leaveCancelDaysSubmit')}</button></div>
    </form>}
    {error && !dialog && <p role="alert" className="form-error">{error}</p>}
  </section>;
}
