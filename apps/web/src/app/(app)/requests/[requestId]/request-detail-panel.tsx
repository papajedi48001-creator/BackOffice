'use client';

import { useState } from 'react';
import { t } from '@backoffice/i18n';
import { StatusBadge, type RequestDisplayStatus } from '../../../../components/status-badge';

export function RequestDetailPanel({ requestId, reference, organizationId, status: initialStatus, canApprove, statusAfterApprove }: { requestId: string; reference: string; organizationId: string; status: RequestDisplayStatus; canApprove: boolean; statusAfterApprove: 'IN_REVIEW' | 'APPROVED' }) {
  const [status, setStatus] = useState<RequestDisplayStatus>(initialStatus);
  const [hasDecided, setHasDecided] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(false);

  async function approveRequest() {
    setIsSubmitting(true);
    setError(false);
    try {
      const response = await fetch(`/api/requests/${encodeURIComponent(requestId)}/decisions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision: 'APPROVE' })
      });
      if (!response.ok) throw new Error('DECISION_NOT_ACCEPTED');
      setStatus(statusAfterApprove);
      setHasDecided(true);
    } catch {
      setError(true);
    } finally {
      setIsSubmitting(false);
    }
  }

  return <section><h2>{t('requestDetail')}</h2><dl className="detail-list"><div><dt>{t('requestReference')}</dt><dd>{reference}</dd></div><div><dt>{t('requestor')}</dt><dd>{t('samplePerson')}</dd></div><div><dt>{t('organization')}</dt><dd>{organizationId}</dd></div><div><dt>{t('status')}</dt><dd><StatusBadge status={status} /></dd></div></dl>{canApprove && status === 'IN_REVIEW' && !hasDecided && <button type="button" disabled={isSubmitting} onClick={approveRequest}>{isSubmitting ? t('deciding') : t('approveRequest')}</button>}{error && <p role="alert">{t('decisionNotAccepted')}</p>}</section>;
}
