'use client';

import { useState } from 'react';
import type { RequestHistoryView } from '@backoffice/core';
import { t, type MessageKey } from '@backoffice/i18n';
import { StatusBadge, type RequestDisplayStatus } from '../../../../components/status-badge';
import { ReasonForm } from './reason-form';

type ReasonAction = 'REJECT' | 'RETURN' | 'CANCEL';
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
  const [openForm, setOpenForm] = useState<ReasonAction | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(false);
  const path = `/api/requests/${encodeURIComponent(requestId)}`;

  async function send(url: string, body: object, nextStatus: RequestDisplayStatus) {
    setIsSubmitting(true);
    setError(false);
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error('ACTION_NOT_ACCEPTED');
      setStatus(nextStatus);
      setHasActed(true);
      setOpenForm(null);
    } catch {
      setError(true);
    } finally {
      setIsSubmitting(false);
    }
  }

  function confirmReason(reason: string) {
    if (openForm === 'CANCEL') return send(`${path}/cancellation`, { reason }, 'CANCELLED');
    if (openForm) return send(`${path}/decisions`, { decision: openForm, reason }, openForm === 'REJECT' ? 'REJECTED' : 'RETURNED');
  }

  const canApprove = actions.approve && status === 'IN_REVIEW';
  const canCancel = actions.cancel && (status === 'IN_REVIEW' || status === 'RETURNED');
  const canResubmit = actions.resubmit && status === 'RETURNED';
  const showActions = !hasActed && !openForm && (canApprove || canCancel || canResubmit);

  return <section>
    <h2>{t('requestDetail')}</h2>
    <dl className="detail-list">
      <div><dt>{t('requestReference')}</dt><dd>{reference}</dd></div>
      <div><dt>{t('requestor')}</dt><dd>{requestorName}</dd></div>
      <div><dt>{t('organization')}</dt><dd>{organizationName}</dd></div>
      <div><dt>{t('status')}</dt><dd><StatusBadge status={status} /></dd></div>
    </dl>
    {showActions && <div className="request-actions">
      {canApprove && <button type="button" disabled={isSubmitting} onClick={() => send(`${path}/decisions`, { decision: 'APPROVE' }, statusAfterApprove)}>{t('actionApprove')}</button>}
      {canApprove && <button type="button" className="button-secondary" disabled={isSubmitting} onClick={() => setOpenForm('RETURN')}>{t('actionReturn')}</button>}
      {canApprove && <button type="button" className="button-danger" disabled={isSubmitting} onClick={() => setOpenForm('REJECT')}>{t('actionReject')}</button>}
      {canResubmit && <button type="button" disabled={isSubmitting} onClick={() => send(`${path}/resubmission`, {}, 'IN_REVIEW')}>{t('actionResubmit')}</button>}
      {canCancel && <button type="button" className="button-danger" disabled={isSubmitting} onClick={() => setOpenForm('CANCEL')}>{t('actionCancelRequest')}</button>}
    </div>}
    {openForm && !hasActed && <ReasonForm isSubmitting={isSubmitting} onConfirm={confirmReason} onClose={() => { setOpenForm(null); setError(false); }} />}
    {hasActed && <p className="action-saved" role="status">{t('actionSaved')}</p>}
    {error && <p role="alert" className="form-error">{t('actionNotAccepted')}</p>}
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
