'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { t } from '@backoffice/i18n';
import { leaveErrorMessage } from '../../../../../lib/leave-labels';

type Decision = 'APPROVE' | 'RETURN' | 'REJECT';

/** Decide (current approver), cancel (owner of a pending ใบลา) and ขอยกเลิกวันลา (owner of an approved one). The server re-checks each. */
export function LeaveActions({ requestId, canDecide, canCancel, canRequestCancelDays }: { requestId: string; canDecide: boolean; canCancel: boolean; canRequestCancelDays: boolean }) {
  const router = useRouter();
  const [reason, setReason] = useState('');
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

  function decide(decision: Decision) {
    if (decision !== 'APPROVE' && !reason.trim()) { setError(t('leaveReasonRequired')); return; }
    void send(`/api/requests/${id}/decisions`, decision === 'APPROVE' ? { decision } : { decision, reason: reason.trim() }, () => { setReason(''); router.refresh(); });
  }

  function cancel() {
    if (!reason.trim()) { setError(t('leaveReasonRequired')); return; }
    void send(`/api/leave/${id}/cancellation`, { reason: reason.trim() }, () => { setReason(''); router.refresh(); });
  }

  function cancelDays(event: React.FormEvent) {
    event.preventDefault();
    if (!range.reason.trim()) { setError(t('leaveReasonRequired')); return; }
    void send(`/api/leave/${id}/cancel-days`, { ...range, reason: range.reason.trim() }, (result) => router.push(`/leave/requests/${result.requestId}`));
  }

  if (!canDecide && !canCancel && !canRequestCancelDays) return null;
  return <section className="leave-actions">
    {(canDecide || canCancel) && <div className="reason-form">
      <label htmlFor="leave-action-reason">{t('leaveDecisionReason')}</label>
      <textarea id="leave-action-reason" value={reason} maxLength={1000} rows={3} onChange={(event) => setReason(event.target.value)} />
      <div className="form-actions">
        {canDecide && <button type="button" disabled={busy} onClick={() => decide('APPROVE')}>{t('leaveApprove')}</button>}
        {canDecide && <button type="button" className="button-secondary" disabled={busy} onClick={() => decide('RETURN')}>{t('leaveReturn')}</button>}
        {canDecide && <button type="button" className="button-danger" disabled={busy} onClick={() => decide('REJECT')}>{t('leaveReject')}</button>}
        {canCancel && <button type="button" className="button-danger" disabled={busy} onClick={cancel}>{t('leaveCancel')}</button>}
      </div>
    </div>}
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
    {error && <p role="alert" className="form-error">{error}</p>}
  </section>;
}
