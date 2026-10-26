'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { t } from '@backoffice/i18n';
import { ActionDialog } from '../../../../components/action-dialog';
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
export function MemberDecision({ requestId, name }: { requestId: string; name: string }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Decision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm(decision: Decision, reason: string) {
    setBusy(true); setError(null);
    const failure = await post(`/api/requests/${encodeURIComponent(requestId)}/decisions`, decision === 'APPROVE' ? { decision } : { decision, reason });
    setBusy(false);
    if (failure) { setError(failure); return; }
    setDialog(null);
    router.refresh();
  }

  return <div className="request-actions travel-member-actions">
    <button type="button" aria-label={`${t('leaveApprove')} ${name}`} disabled={busy} onClick={() => setDialog('APPROVE')}>{t('leaveApprove')}</button>
    <button type="button" aria-label={`${t('leaveReturn')} ${name}`} className="button-secondary" disabled={busy} onClick={() => setDialog('RETURN')}>{t('leaveReturn')}</button>
    <button type="button" aria-label={`${t('leaveReject')} ${name}`} className="button-danger" disabled={busy} onClick={() => setDialog('REJECT')}>{t('leaveReject')}</button>
    {dialog && <ActionDialog title={`${t(titles[dialog])} · ${name}`} message={dialog === 'APPROVE' ? t('dialogConfirmQuestion') : undefined} confirmLabel={t('confirmAction')} tone={dialog === 'REJECT' ? 'danger' : 'primary'} reason={dialog !== 'APPROVE'} isSubmitting={busy} error={error} onConfirm={(reason) => void confirm(dialog, reason)} onClose={() => { setDialog(null); setError(null); }} />}
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
