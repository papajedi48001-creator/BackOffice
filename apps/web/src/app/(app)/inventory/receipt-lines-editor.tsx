'use client';

import { useState } from 'react';
import type { InventoryUnitKind, ReceiptLineInput } from '@backoffice/contracts';
import type { ScanItem, ScanResult } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { formatBaht } from './inventory-format';
import { inventoryErrorText } from './inventory-errors';
import { ScanField } from './scan-field';

/** Form state for one receipt line; numbers stay as typed until the line is sent. */
export interface EditorLine { key: string; item: ScanItem; unitKind: InventoryUnitKind; quantity: string; unitPrice: string; manufacturerLotNo: string; expiryDate: string; }

export function newLine(item: ScanItem, unitKind: InventoryUnitKind, key: string): EditorLine {
  return { key, item, unitKind, quantity: '1', unitPrice: '0', manufacturerLotNo: '', expiryDate: '' };
}

/** A repeated scan of the same item and unit adds one to its last line; inactive items and printed lot labels are refused. */
export function applyScan(lines: EditorLine[], result: ScanResult, key: string): { lines: EditorLine[] } | { error: string } {
  if (result.kind === 'lot') return { error: `${t('inventoryScanAlreadyReceived')} (${result.lot.lotCode})` };
  if (!result.item.isActive) return { error: inventoryErrorText('ITEM_INACTIVE') };
  const unitKind = result.kind === 'barcode' ? result.unitKind : 'ISSUE';
  let index = -1;
  lines.forEach((line, at) => { if (line.item.id === result.item.id && line.unitKind === unitKind) index = at; });
  if (index < 0) return { lines: [...lines, newLine(result.item, unitKind, key)] };
  return { lines: lines.map((line, at) => (at === index ? { ...line, quantity: String((Number(line.quantity) || 0) + 1) } : line)) };
}

export function toLineInputs(lines: EditorLine[]): ReceiptLineInput[] {
  return lines.map((line) => ({
    itemId: line.item.id,
    unitKind: line.unitKind,
    quantity: Number(line.quantity),
    unitPrice: Number(line.unitPrice),
    ...(line.manufacturerLotNo.trim() ? { manufacturerLotNo: line.manufacturerLotNo.trim() } : {}),
    ...(line.item.tracksExpiry && line.expiryDate ? { expiryDate: line.expiryDate } : {})
  }));
}

/** Display only: the server computes the stored total. */
function lineTotal(line: EditorLine): string {
  const quantity = Number(line.quantity);
  const satang = Math.round(Number(line.unitPrice) * 100);
  if (!Number.isFinite(quantity) || !Number.isFinite(satang)) return '–';
  return formatBaht((quantity * satang / 100).toFixed(2));
}

let keys = 0;
const nextKey = () => `line-${Date.now()}-${keys++}`;

export function ReceiptLinesEditor({ lines, onChange, items, canBindBarcode }: { lines: EditorLine[]; onChange(lines: EditorLine[]): void; items: ScanItem[]; canBindBarcode: boolean }) {
  const [message, setMessage] = useState<string | null>(null);
  const [unknownCode, setUnknownCode] = useState<string | null>(null);
  const [binding, setBinding] = useState<{ itemId: string; unitKind: InventoryUnitKind }>({ itemId: '', unitKind: 'ISSUE' });
  const activeItems = items.filter((item) => item.isActive);
  const update = (key: string, patch: Partial<EditorLine>) => onChange(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  function onScan(result: ScanResult) {
    setUnknownCode(null);
    const applied = applyScan(lines, result, nextKey());
    if ('error' in applied) { setMessage(applied.error); return; }
    setMessage(null);
    onChange(applied.lines);
  }

  function pick(itemId: string) {
    const item = activeItems.find((candidate) => candidate.id === itemId);
    if (item) onScan({ kind: 'item', item });
  }

  // Not a nested <form>: the editor already sits inside the delivery form.
  async function bind() {
    const item = activeItems.find((candidate) => candidate.id === binding.itemId);
    const { unitKind } = binding;
    if (!unknownCode || !item) return;
    try {
      const response = await fetch(`/api/inventory/items/${item.id}/barcodes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ barcode: unknownCode, unitKind }) });
      const body = await response.json().catch(() => ({})) as { error?: string; itemCode?: string };
      if (!response.ok) { setMessage(body.error === 'DUPLICATE_BARCODE' && body.itemCode ? `${inventoryErrorText(body.error)} (${body.itemCode})` : inventoryErrorText(body.error)); return; }
      setBinding({ itemId: '', unitKind: 'ISSUE' });
      onScan({ kind: 'barcode', unitKind, item });
    } catch {
      setMessage(t('inventoryActionFailed'));
    }
  }

  return (
    <div className="inventory-lines">
      <ScanField onResult={onScan} onNotFound={(code) => setUnknownCode(canBindBarcode ? code : null)} />
      {message ? <p role="alert">{message}</p> : null}
      {unknownCode ? (
        <div className="inventory-inline-form" role="group" aria-label={t('inventoryBindBarcode')}>
          <strong>{t('inventoryBindBarcode')} <span className="code">{unknownCode}</span></strong>
          <select aria-label={t('inventoryPickItem')} value={binding.itemId} onChange={(event) => setBinding({ ...binding, itemId: event.target.value })}>{[<option key="" value="" disabled>{t('inventoryPickItem')}</option>, ...activeItems.map((item) => <option key={item.id} value={item.id}>{item.code} {item.name}</option>)]}</select>
          <select aria-label={t('inventoryBarcodeUnit')} value={binding.unitKind} onChange={(event) => setBinding({ ...binding, unitKind: event.target.value === 'PURCHASE' ? 'PURCHASE' : 'ISSUE' })}><option value="ISSUE">{t('inventoryIssueUnit')}</option><option value="PURCHASE">{t('inventoryPurchaseUnit')}</option></select>
          <button type="button" disabled={!binding.itemId} onClick={() => void bind()}>{t('inventoryConfirm')}</button>
          <button type="button" onClick={() => setUnknownCode(null)}>{t('inventoryCancel')}</button>
        </div>
      ) : null}
      <label className="inventory-pick">
        {t('inventoryPickItem')}
        <select value="" onChange={(event) => pick(event.target.value)}><option value="">–</option>{activeItems.map((item) => <option key={item.id} value={item.id}>{item.code} {item.name}</option>)}</select>
      </label>
      {lines.length ? (
        <table className="inventory-table">
          <thead><tr><th>{t('inventoryName')}</th><th className="numeric">{t('inventoryQuantity')}</th><th>{t('inventoryUnit')}</th><th className="numeric">{t('inventoryUnitPrice')}</th><th>{t('inventoryManufacturerLot')}</th><th>{t('inventoryExpiry')}</th><th className="numeric">{t('inventoryLineTotal')}</th><th /></tr></thead>
          <tbody>{lines.map((line) => (
            <tr key={line.key}>
              <td><span className="code">{line.item.code}</span> {line.item.name}</td>
              <td className="numeric"><input aria-label={`${t('inventoryQuantity')} ${line.item.name}`} type="number" inputMode="numeric" min={1} step={1} value={line.quantity} onChange={(event) => update(line.key, { quantity: event.target.value })} /></td>
              <td><select aria-label={`${t('inventoryUnit')} ${line.item.name}`} value={line.unitKind} onChange={(event) => update(line.key, { unitKind: event.target.value === 'PURCHASE' ? 'PURCHASE' : 'ISSUE' })}><option value="ISSUE">{line.item.issueUnit}</option><option value="PURCHASE">{line.item.purchaseUnit}</option></select></td>
              <td className="numeric"><input aria-label={`${t('inventoryUnitPrice')} ${line.item.name}`} type="number" inputMode="decimal" min={0} step="0.01" value={line.unitPrice} onChange={(event) => update(line.key, { unitPrice: event.target.value })} /></td>
              <td><input aria-label={`${t('inventoryManufacturerLot')} ${line.item.name}`} value={line.manufacturerLotNo} maxLength={60} onChange={(event) => update(line.key, { manufacturerLotNo: event.target.value })} /></td>
              <td>{line.item.tracksExpiry ? <input aria-label={`${t('inventoryExpiry')} ${line.item.name}`} type="date" required value={line.expiryDate} onChange={(event) => update(line.key, { expiryDate: event.target.value })} /> : '–'}</td>
              <td className="numeric">{lineTotal(line)}</td>
              <td><button type="button" onClick={() => onChange(lines.filter((other) => other.key !== line.key))}>{t('inventoryRemoveLine')}</button></td>
            </tr>
          ))}</tbody>
        </table>
      ) : null}
    </div>
  );
}
