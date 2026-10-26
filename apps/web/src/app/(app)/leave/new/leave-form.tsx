'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LeaveBalance, LeaveCounting, LeaveWarning } from '@backoffice/contracts';
import { t } from '@backoffice/i18n';
import { leaveDaysLabel, leaveErrorMessage, leaveWarningText } from '../../../../lib/leave-labels';

export interface LeaveFormType { id: string; code: string; name: string; counting: LeaveCounting }
export interface LeaveFormValues { leaveTypeId: string; startDate: string; endDate: string; startHalf: 'FULL' | 'AFTERNOON'; endHalf: 'FULL' | 'MORNING'; reason: string; contactDuringLeave: string | null }
interface Preview { days: number; balance: LeaveBalance | null; warnings: LeaveWarning[]; medicalCertificateRequired: boolean; error: string | null }

const empty: LeaveFormValues = { leaveTypeId: '', startDate: '', endDate: '', startHalf: 'FULL', endHalf: 'FULL', reason: '', contactDuringLeave: null };

/** Files a ใบลา, or with `requestId` edits and resubmits a returned one. The preview runs the server's checks as the dates change. */
export function LeaveForm({ types, requestId, initial }: { types: LeaveFormType[]; requestId?: string; initial?: LeaveFormValues }) {
  const router = useRouter();
  const [form, setForm] = useState<LeaveFormValues>(initial ?? empty);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const counting = types.find((type) => type.id === form.leaveTypeId)?.counting ?? 'WORKING_DAYS';
  const ready = Boolean(form.leaveTypeId && form.startDate && form.endDate && form.endDate >= form.startDate);
  const body = () => ({ leaveTypeId: form.leaveTypeId, startDate: form.startDate, endDate: form.endDate, startHalf: form.startHalf, endHalf: form.endHalf, reason: form.reason.trim(), contactDuringLeave: form.contactDuringLeave?.trim() || null });

  useEffect(() => {
    if (!ready) { setPreview(null); return; }
    let current = true;
    const timer = setTimeout(() => {
      void fetch('/api/leave/preview', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body()) })
        .then(async (response) => { if (current && response.ok) setPreview((await response.json()) as Preview); })
        .catch(() => undefined);
    }, 250);
    return () => { current = false; clearTimeout(timer); };
    // Only the fields that change the count re-run the preview.
  }, [form.leaveTypeId, form.startDate, form.endDate, form.startHalf, form.endHalf, ready]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!form.reason.trim()) { setError(t('leaveReasonRequired')); return; }
    setBusy(true);
    try {
      const response = await fetch(requestId ? `/api/leave/${encodeURIComponent(requestId)}` : '/api/leave', { method: requestId ? 'PUT' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body()) });
      const result = (await response.json()) as { ok?: boolean; requestId?: string; error?: string };
      if (response.ok && result.ok) {
        if (requestId) router.refresh();
        else router.push(`/leave/requests/${result.requestId}`);
        return;
      }
      setError(leaveErrorMessage(result.error));
    } catch { setError(leaveErrorMessage(null)); } finally { setBusy(false); }
  }

  const set = (patch: Partial<LeaveFormValues>) => setForm({ ...form, ...patch });
  const oneDay = form.startDate !== '' && form.startDate === form.endDate;
  return <form aria-label={requestId ? t('leaveEditReturned') : t('leaveNew')} className="leave-form" onSubmit={submit}>
    <div className="form-field"><label htmlFor="leave-type">{t('leaveType')}</label>
      <select id="leave-type" value={form.leaveTypeId} required onChange={(event) => set({ leaveTypeId: event.target.value })}>
        <option value="">—</option>
        {types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
      </select></div>
    <div className="form-row">
      <div className="form-field"><label htmlFor="leave-start">{t('leaveStartDate')}</label><input id="leave-start" type="date" value={form.startDate} required onChange={(event) => set({ startDate: event.target.value, endDate: form.endDate && form.endDate >= event.target.value ? form.endDate : event.target.value })} /></div>
      <div className="form-field"><label htmlFor="leave-start-half">{t('leaveStartHalf')}</label>
        <select id="leave-start-half" value={form.startHalf} onChange={(event) => set({ startHalf: event.target.value as LeaveFormValues['startHalf'] })}>
          <option value="FULL">{t('leaveHalfFull')}</option><option value="AFTERNOON" disabled={oneDay && form.endHalf === 'MORNING'}>{t('leaveHalfAfternoon')}</option>
        </select></div>
    </div>
    <div className="form-row">
      <div className="form-field"><label htmlFor="leave-end">{t('leaveEndDate')}</label><input id="leave-end" type="date" value={form.endDate} min={form.startDate || undefined} required onChange={(event) => set({ endDate: event.target.value })} /></div>
      <div className="form-field"><label htmlFor="leave-end-half">{t('leaveEndHalf')}</label>
        <select id="leave-end-half" value={form.endHalf} onChange={(event) => set({ endHalf: event.target.value as LeaveFormValues['endHalf'] })}>
          <option value="FULL">{t('leaveHalfFull')}</option><option value="MORNING" disabled={oneDay && form.startHalf === 'AFTERNOON'}>{t('leaveHalfMorning')}</option>
        </select></div>
    </div>
    {preview && <section className="leave-preview" aria-live="polite">
      {preview.error ? <p role="alert" className="form-error">{leaveErrorMessage(preview.error)}</p> : <p><strong>{leaveDaysLabel(preview.days, counting)}</strong></p>}
      {preview.balance && !preview.error && <p>{t('leaveRemainingAfter')} {preview.balance.remaining} {t('leaveDayUnit')}</p>}
      {preview.warnings.length > 0 && <div className="leave-warning">{preview.warnings.map((warning) => <p key={warning.month}>{leaveWarningText(warning)}</p>)}<p>{t('leaveWarningNote')}</p></div>}
      {preview.medicalCertificateRequired && <p className="leave-notice">{t('leaveMedicalCertificate')}</p>}
    </section>}
    <div className="form-field"><label htmlFor="leave-reason">{t('leaveReason')}</label><textarea id="leave-reason" value={form.reason} maxLength={1000} rows={3} onChange={(event) => set({ reason: event.target.value })} /></div>
    <div className="form-field"><label htmlFor="leave-contact">{t('leaveContact')}</label><input id="leave-contact" value={form.contactDuringLeave ?? ''} maxLength={500} onChange={(event) => set({ contactDuringLeave: event.target.value })} /></div>
    {error && <p role="alert" className="form-error">{error}</p>}
    <div className="form-actions"><button type="submit" disabled={busy}>{requestId ? t('leaveResubmit') : t('leaveSubmit')}</button></div>
  </form>;
}
