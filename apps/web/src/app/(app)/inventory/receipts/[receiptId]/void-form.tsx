'use client';

import { useState } from 'react';
import { t } from '@backoffice/i18n';
import { useInventorySave } from '../../use-inventory-save';

/** Voiding takes a reason and a second press, without a browser dialog. */
export function VoidForm({ receiptId }: { receiptId: string }) {
  const { save, error, pending } = useInventorySave();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  if (!open) return <div className="form-actions"><button type="button" onClick={() => setOpen(true)}>{t('inventoryVoid')}</button></div>;
  return (
    <div className="inventory-form">
      <label>{t('inventoryVoidReason')}<textarea required maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      {error ? <p role="alert">{error}</p> : null}
      <div className="form-actions">
        <button type="button" disabled={pending || !reason.trim()} onClick={() => void save(`/api/inventory/receipts/${receiptId}/void`, 'POST', { reason: reason.trim() })}>{t('inventoryConfirm')}</button>
        <button type="button" className="button-secondary" onClick={() => { setOpen(false); setReason(''); }}>{t('inventoryCancel')}</button>
      </div>
    </div>
  );
}
