'use client';

import { OwnRequestMarker } from '../../../../components/own-request-marker';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { t } from '@backoffice/i18n';
import { ActionDialog } from '../../../../components/action-dialog';
import { FormDialog } from '../../../../components/form-dialog';
import { travelErrorMessage } from '../../../../lib/travel-labels';

type Decision = 'APPROVE' | 'RETURN' | 'REJECT';
const titles = { APPROVE: 'leaveApprove', RETURN: 'leaveReturn', REJECT: 'leaveReject' } as const;

async function post(url: string, body: Record<string, string>): Promise<string | null> {
  try {
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (response.ok) return null;
    return travelErrorMessage(((await response.json()) as { error?: string }).error);
  } catch { return travelErrorMessage(null); }
}

/** Decide one person's คำขอ through the central workflow; the server re-checks that the viewer is its current approver. */
/** `ownRequest`: the viewer's own คำขอ (admin/manager tier); every decision then needs a reason. */
export function MemberDecision({ requestId, name, ownRequest = false }: { requestId: string; name: string; ownRequest?: boolean }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Decision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm(decision: Decision, reason: string) {
    setBusy(true); setError(null);
    const failure = await post(`/api/requests/${encodeURIComponent(requestId)}/decisions`, decision === 'APPROVE' && !ownRequest ? { decision } : { decision, reason });
    setBusy(false);
    if (failure) { setError(failure); return; }
    setDialog(null);
    router.refresh();
  }

  return <div className="request-actions travel-member-actions">
    {ownRequest && <OwnRequestMarker />}
    <button type="button" aria-label={`${t('leaveApprove')} ${name}`} disabled={busy} onClick={() => setDialog('APPROVE')}>{t('leaveApprove')}</button>
    <button type="button" aria-label={`${t('leaveReturn')} ${name}`} className="button-secondary" disabled={busy} onClick={() => setDialog('RETURN')}>{t('leaveReturn')}</button>
    <button type="button" aria-label={`${t('leaveReject')} ${name}`} className="button-danger" disabled={busy} onClick={() => setDialog('REJECT')}>{t('leaveReject')}</button>
    {dialog && <ActionDialog title={`${t(titles[dialog])} · ${name}`} message={ownRequest ? t('ownRequestReasonNotice') : dialog === 'APPROVE' ? t('dialogConfirmQuestion') : undefined} confirmLabel={t('confirmAction')} tone={dialog === 'REJECT' ? 'danger' : 'primary'} reason={dialog !== 'APPROVE' || ownRequest} isSubmitting={busy} error={error} onConfirm={(reason) => void confirm(dialog, reason)} onClose={() => { setDialog(null); setError(null); }} />}
  </div>;
}

/** The หัวหน้าคณะ withdraws every waiting คำขอ of the trip at once. */
export function TravelCancel({ travelId }: { travelId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm(reason: string) {
    setBusy(true); setError(null);
    const failure = await post(`/api/travel/${encodeURIComponent(travelId)}/cancellation`, { reason });
    setBusy(false);
    if (failure) { setError(failure); return; }
    setOpen(false);
    router.refresh();
  }

  return <div className="request-actions">
    <button type="button" className="button-danger" disabled={busy} onClick={() => setOpen(true)}>{t('travelCancel')}</button>
    {open && <ActionDialog title={t('travelCancel')} confirmLabel={t('confirmAction')} tone="danger" reason isSubmitting={busy} error={error} onConfirm={(reason) => void confirm(reason)} onClose={() => { setOpen(false); setError(null); }} />}
  </div>;
}

/** The หัวหน้าคณะ's รายงานการไปราชการ; the server checks who they are and that the trip has ended. */
export function TravelReportForm({ travelId, initial }: { travelId: string; initial: { summary: string; application: string } }) {
  const router = useRouter();
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/travel/${encodeURIComponent(travelId)}/report`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ summary: draft.summary.trim(), application: draft.application.trim() }) });
      if (response.ok) { router.refresh(); return true; }
      setError(travelErrorMessage(((await response.json()) as { error?: string }).error));
    } catch { setError(travelErrorMessage(null)); } finally { setBusy(false); }
    return false;
  }

  return <div className="request-actions"><FormDialog title={t('travelReport')} triggerLabel={t('travelReport')} submitLabel={t('travelReportSave')} wide isSubmitting={busy} error={error} onOpenChange={(open) => { if (open) setError(null); }} onSubmit={submit}>
    <p className="permission-notice">{t('travelReportHelp')}</p>
    <label htmlFor="report-summary">{t('travelReportSummary')}</label>
    <textarea id="report-summary" value={draft.summary} maxLength={5000} rows={4} required onChange={(event) => setDraft({ ...draft, summary: event.target.value })} />
    <label htmlFor="report-application">{t('travelReportApplication')}</label>
    <textarea id="report-application" value={draft.application} maxLength={5000} rows={3} required onChange={(event) => setDraft({ ...draft, application: event.target.value })} />
  </FormDialog></div>;
}
