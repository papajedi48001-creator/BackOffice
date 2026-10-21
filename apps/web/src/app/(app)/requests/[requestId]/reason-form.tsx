'use client';

import { useId, useState } from 'react';
import { t } from '@backoffice/i18n';

export function ReasonForm({ isSubmitting, onConfirm, onClose }: { isSubmitting: boolean; onConfirm: (reason: string) => void; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const fieldId = useId();
  return <form className="reason-form" onSubmit={(event) => { event.preventDefault(); if (reason.trim()) onConfirm(reason.trim()); }}>
    <label htmlFor={fieldId}>{t('reasonLabel')}</label>
    <textarea id={fieldId} maxLength={2000} required value={reason} onChange={(event) => setReason(event.target.value)} autoFocus />
    <div className="form-actions">
      <button type="submit" disabled={isSubmitting || !reason.trim()}>{isSubmitting ? t('savingAction') : t('confirmAction')}</button>
      <button type="button" className="button-secondary" disabled={isSubmitting} onClick={onClose}>{t('closeForm')}</button>
    </div>
  </form>;
}
