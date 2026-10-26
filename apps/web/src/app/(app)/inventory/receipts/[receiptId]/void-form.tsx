'use client';

import { useState } from 'react';
import { t } from '@backoffice/i18n';
import { ActionDialog } from '../../../../../components/action-dialog';
import { useInventorySave } from '../../use-inventory-save';

/** Voiding takes a reason in a popup, without a browser dialog. */
export function VoidForm({ receiptId }: { receiptId: string }) {
  const { save, error, pending } = useInventorySave();
  const [open, setOpen] = useState(false);
  return <div className="form-actions">
    <button type="button" className="button-danger" onClick={() => setOpen(true)}>{t('inventoryVoid')}</button>
    {open && <ActionDialog title={t('inventoryVoid')} confirmLabel={t('inventoryConfirm')} tone="danger" reason isSubmitting={pending} error={error} onConfirm={(reason) => void save(`/api/inventory/receipts/${receiptId}/void`, 'POST', { reason })} onClose={() => setOpen(false)} />}
  </div>;
}
