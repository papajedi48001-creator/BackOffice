'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { t } from '@backoffice/i18n';
import { ActionDialog } from '../../../../../components/action-dialog';
import { sendFleet } from '../../../../../lib/fleet-labels';

/** One confirm or reason step on a ใบ: opens an ActionDialog, sends the body (never the URL) and refreshes. The route checks who may do it. */
function FleetStep({ label, url, method, reason = false, tone = 'danger' }: { label: string; url: string; method: 'POST' | 'DELETE'; reason?: boolean; tone?: 'primary' | 'danger' }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm(text: string) {
    setBusy(true); setError(null);
    const sent = await sendFleet(url, method, reason ? { reason: text } : undefined);
    setBusy(false);
    if (sent.error) { setError(sent.error); return; }
    setOpen(false);
    router.refresh();
  }

  return <>
    <button type="button" className={tone === 'danger' ? 'button-danger' : 'button-secondary'} disabled={busy} onClick={() => setOpen(true)}>{label}</button>
    {open && <ActionDialog title={label} message={reason ? undefined : t('dialogConfirmQuestion')} confirmLabel={t('confirmAction')} tone={tone} reason={reason} maxLength={500} isSubmitting={busy} error={error} onConfirm={(text) => void confirm(text)} onClose={() => { setOpen(false); setError(null); }} />}
  </>;
}

/** The requester cancels with a reason, until the car leaves. */
export function FleetCancel({ fleetRequestId }: { fleetRequestId: string }) {
  return <FleetStep label={t('fleetCancel')} url={`/api/fleet/requests/${encodeURIComponent(fleetRequestId)}/cancellation`} method="POST" reason />;
}

/** The หัวหน้าหมวด takes a ใบ off its PLANNED เที่ยวรถ, back to รอจัดรถ. */
export function FleetUnassign({ fleetRequestId }: { fleetRequestId: string }) {
  return <FleetStep label={t('fleetUnassign')} url={`/api/fleet/requests/${encodeURIComponent(fleetRequestId)}/assignment`} method="DELETE" tone="primary" />;
}

type Decision = 'APPROVE' | 'RETURN' | 'REJECT';
const decisionLabels = { APPROVE: 'fleetHeadApprove', RETURN: 'fleetHeadReturn', REJECT: 'fleetHeadReject' } as const;

/** The head stage: เห็นชอบ, ส่งกลับแก้ไข or ไม่เห็นชอบ the head คำขอ through the central workflow, which re-checks that the viewer decides it now. */
export function HeadDecision({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Decision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm(decision: Decision, reason: string) {
    setBusy(true); setError(null);
    const sent = await sendFleet(`/api/requests/${encodeURIComponent(requestId)}/decisions`, 'POST', decision === 'APPROVE' ? { decision } : { decision, reason });
    setBusy(false);
    if (sent.error) { setError(sent.error); return; }
    setDialog(null);
    router.refresh();
  }

  return <>
    <button type="button" disabled={busy} onClick={() => setDialog('APPROVE')}>{t('fleetHeadApprove')}</button>
    <button type="button" className="button-secondary" disabled={busy} onClick={() => setDialog('RETURN')}>{t('fleetHeadReturn')}</button>
    <button type="button" className="button-danger" disabled={busy} onClick={() => setDialog('REJECT')}>{t('fleetHeadReject')}</button>
    {dialog && <ActionDialog title={t(decisionLabels[dialog])} message={dialog === 'APPROVE' ? t('dialogConfirmQuestion') : undefined} confirmLabel={t('confirmAction')} tone={dialog === 'REJECT' ? 'danger' : 'primary'} reason={dialog !== 'APPROVE'} isSubmitting={busy} error={error} onConfirm={(reason) => void confirm(dialog, reason)} onClose={() => { setDialog(null); setError(null); }} />}
  </>;
}
