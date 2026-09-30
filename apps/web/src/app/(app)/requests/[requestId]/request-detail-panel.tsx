'use client';

import { useState } from 'react';
import { t } from '@backoffice/i18n';
import { StatusBadge } from '../../../../components/status-badge';

export function RequestDetailPanel({ requestId }: { requestId: string }) {
  const [status, setStatus] = useState<'PENDING' | 'APPROVED'>('PENDING');
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
      setStatus('APPROVED');
    } catch {
      setError(true);
    } finally {
      setIsSubmitting(false);
    }
  }

  return <section><h2>{t('requestDetail')}</h2><dl className="detail-list"><div><dt>{t('requestReference')}</dt><dd>{requestId}</dd></div><div><dt>{t('requestor')}</dt><dd>{t('samplePerson')}</dd></div><div><dt>{t('organization')}</dt><dd>{t('sampleOrganization')}</dd></div><div><dt>{t('status')}</dt><dd><StatusBadge status={status} /></dd></div></dl>{status === 'PENDING' && <button type="button" disabled={isSubmitting} onClick={approveRequest}>{isSubmitting ? t('deciding') : t('approveRequest')}</button>}{error && <p role="alert">{t('decisionNotAccepted')}</p>}</section>;
}
