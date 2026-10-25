'use client';

import { useState } from 'react';
import type { ScanItem } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { ReceiptLinesEditor, toLineInputs, type EditorLine } from '../receipt-lines-editor';
import { useInventorySave } from '../use-inventory-save';

export function StartOpening() {
  const { save, error, pending } = useInventorySave();
  return <div className="inventory-form"><p>{t('inventoryOpeningFirstNote')}</p>{error ? <p role="alert">{error}</p> : null}<div className="form-actions"><button type="button" disabled={pending} onClick={() => void save('/api/inventory/opening', 'POST')}>{t('inventoryStartOpening')}</button></div></div>;
}

/** The officer's draft: save as often as needed, then send it to the supervisor. */
export function OpeningEditor({ initialLines, items, canBindBarcode }: { initialLines: EditorLine[]; items: ScanItem[]; canBindBarcode: boolean }) {
  const { save, error, pending } = useInventorySave();
  const [lines, setLines] = useState(initialLines);
  const saveLines = () => save('/api/inventory/opening/lines', 'PUT', { lines: toLineInputs(lines) });
  async function submit() {
    if (await saveLines()) await save('/api/inventory/opening/submission', 'POST');
  }
  return (
    <div className="inventory-form inventory-form-wide">
      <ReceiptLinesEditor lines={lines} onChange={setLines} items={items} canBindBarcode={canBindBarcode} />
      {error ? <p role="alert">{error}</p> : null}
      <div className="form-actions">
        <button type="button" disabled={pending} onClick={() => void saveLines()}>{t('inventorySaveOpening')}</button>
        <button type="button" disabled={pending || lines.length === 0} onClick={() => void submit()}>{t('inventorySubmitOpening')}</button>
      </div>
    </div>
  );
}

/** The supervisor certifies or returns the submitted opening balance; a return needs a reason. */
export function OpeningDecision() {
  const { save, error, pending } = useInventorySave();
  const [decision, setDecision] = useState<'CERTIFY' | 'RETURN' | null>(null);
  const [reason, setReason] = useState('');
  const ready = decision === 'CERTIFY' || (decision === 'RETURN' && reason.trim().length > 0);
  async function confirm() {
    if (!decision || !ready) return;
    if (await save('/api/inventory/opening/decision', 'POST', decision === 'RETURN' ? { decision, reason: reason.trim() } : { decision })) { setDecision(null); setReason(''); }
  }
  return (
    <div className="inventory-form">
      <div className="form-actions">
        <button type="button" aria-pressed={decision === 'CERTIFY'} onClick={() => setDecision('CERTIFY')}>{t('inventoryCertify')}</button>
        <button type="button" aria-pressed={decision === 'RETURN'} onClick={() => setDecision('RETURN')}>{t('inventoryReturn')}</button>
      </div>
      {decision === 'RETURN' ? <label>{t('inventoryReturnReason')}<textarea required maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} /></label> : null}
      {decision ? <div className="form-actions"><button type="button" disabled={pending || !ready} onClick={() => void confirm()}>{t('inventoryConfirm')}</button><button type="button" onClick={() => { setDecision(null); setReason(''); }}>{t('inventoryCancel')}</button></div> : null}
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
