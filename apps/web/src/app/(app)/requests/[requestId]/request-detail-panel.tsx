'use client';

import { useState } from 'react';
import type { RequestHistoryView } from '@backoffice/core';
import { t, type MessageKey } from '@backoffice/i18n';
import { StatusBadge, type RequestDisplayStatus } from '../../../../components/status-badge';
import { ActionDialog } from '../../../../components/action-dialog';

type DialogAction = 'APPROVE' | 'REJECT' | 'RETURN' | 'CANCEL' | 'RESUBMIT';

const dialogs: Record<DialogAction, { title: MessageKey; reason: boolean; danger: boolean }> = {
  APPROVE: { title: 'actionApprove', reason: false, danger: false },
  RETURN: { title: 'actionReturn', reason: true, danger: false },
  REJECT: { title: 'actionReject', reason: true, danger: true },
  CANCEL: { title: 'actionCancelRequest', reason: true, danger: true },
  RESUBMIT: { title: 'actionResubmit', reason: false, danger: false }
};
type HistoryEntry = RequestHistoryView['entries'][number];

const historyLabel: Record<HistoryEntry['kind'], MessageKey> = { APPROVE: 'auditResultApproved', REJECT: 'auditResultRejected', RETURN: 'auditResultReturned', CANCEL: 'requestHistoryCancelled' };
const bangkokTime = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' });

export function RequestDetailPanel({ requestId, reference, requestorName, organizationName, status: initialStatus, history, actions, statusAfterApprove }: {
  requestId: string;
  reference: string;
  requestorName: string;
  organizationName: string;
  status: RequestDisplayStatus;
  history: RequestHistoryView['entries'];
  actions: { approve: boolean; cancel: boolean; resubmit: boolean };
  statusAfterApprove: 'IN_REVIEW' | 'APPROVED';
}) {
  const [status, setStatus] = useState<RequestDisplayStatus>(initialStatus);
  const [hasActed, setHasActed] = useState(false);
  const [openForm, setOpenForm] = useState<DialogAction | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const [isStale, setIsStale] = useState(false);
  const path = `/api/requests/${encodeURIComponent(requestId)}`;

  async function send(url: string, body: object, nextStatus: RequestDisplayStatus) {
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok) {
        if (response.status === 409) {
          setIsStale(true);
          setOpenForm(null);
          setError('requestChangedMeanwhile');
          return;
        }
        const failure = await response.json().catch(() => null) as { error?: string } | null;
        setError(failure?.error === 'no_approver' ? 'requestNoApprover' : 'actionNotAccepted');
        return;
      }
      setStatus(nextStatus);
      setHasActed(true);
      setOpenForm(null);
    } catch {
      setError('actionNotAccepted');
    } finally {
      setIsSubmitting(false);
    }
  }

  function confirm(reason: string) {
    if (openForm === 'APPROVE') return send(`${path}/decisions`, { decision: 'APPROVE' }, statusAfterApprove);
    if (openForm === 'RESUBMIT') return send(`${path}/resubmission`, {}, 'IN_REVIEW');
    if (openForm === 'CANCEL') return send(`${path}/cancellation`, { reason }, 'CANCELLED');
    if (openForm) return send(`${path}/decisions`, { decision: openForm, reason }, openForm === 'REJECT' ? 'REJECTED' : 'RETURNED');
  }

  const canApprove = actions.approve && status === 'IN_REVIEW';
  const canCancel = actions.cancel && (status === 'IN_REVIEW' || status === 'RETURNED');
  const canResubmit = actions.resubmit && status === 'RETURNED';
  const showActions = !hasActed && !isStale && (canApprove || canCancel || canResubmit);

  return <section>
    <h2>{t('requestDetail')}</h2>
    <dl className="detail-list">
      <div><dt>{t('requestReference')}</dt><dd>{reference}</dd></div>
      <div><dt>{t('requestor')}</dt><dd>{requestorName}</dd></div>
      <div><dt>{t('organization')}</dt><dd>{organizationName}</dd></div>
      <div><dt>{t('status')}</dt><dd><StatusBadge status={status} /></dd></div>
    </dl>
    {showActions && <div className="request-actions">
      {canApprove && <button type="button" disabled={isSubmitting} onClick={() => setOpenForm('APPROVE')}>{t('actionApprove')}</button>}
      {canApprove && <button type="button" className="button-secondary" disabled={isSubmitting} onClick={() => setOpenForm('RETURN')}>{t('actionReturn')}</button>}
      {canApprove && <button type="button" className="button-danger" disabled={isSubmitting} onClick={() => setOpenForm('REJECT')}>{t('actionReject')}</button>}
      {canResubmit && <button type="button" disabled={isSubmitting} onClick={() => setOpenForm('RESUBMIT')}>{t('actionResubmit')}</button>}
      {canCancel && <button type="button" className="button-danger" disabled={isSubmitting} onClick={() => setOpenForm('CANCEL')}>{t('actionCancelRequest')}</button>}
    </div>}
    {openForm && !hasActed && <ActionDialog title={t(dialogs[openForm].title)} message={dialogs[openForm].reason ? undefined : `${t('dialogConfirmQuestion')} ${reference}`} confirmLabel={t('confirmAction')} tone={dialogs[openForm].danger ? 'danger' : 'primary'} reason={dialogs[openForm].reason} maxLength={2000} isSubmitting={isSubmitting} error={error ? t(error) : null} onConfirm={(reason) => void confirm(reason)} onClose={() => { setOpenForm(null); setError(null); }} />}
    {hasActed && <p className="action-saved" role="status">{t('actionSaved')}</p>}
    {error && !openForm && <p role="alert" className="form-error">{t(error)}</p>}
    <h3 id="request-history-heading">{t('requestHistory')}</h3>
    {history.length
      ? <ul className="request-history" aria-labelledby="request-history-heading">{history.map((entry, index) => <li key={`${entry.at}-${index}`}>
          <time dateTime={entry.at}>{bangkokTime.format(new Date(entry.at))}</time>
          <span><strong>{entry.actorName}</strong> · {t(historyLabel[entry.kind])}</span>
          {entry.reason && <p className="history-reason">{entry.reason}</p>}
        </li>)}</ul>
      : <p>{t('noRequestHistory')}</p>}
  </section>;
}
