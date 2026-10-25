'use client';

import { useState } from 'react';
import type { LabelLot } from '@backoffice/core';
import { inventoryLimits } from '@backoffice/contracts';
import { t } from '@backoffice/i18n';
import { formatThaiDate } from './inventory-format';
import './label-sheet.css';

export type LabelLayout = 'a4-3x8' | 'thermal-50x30';
export interface PrintableLabel { lot: LabelLot; svg: string; }

const clampCopies = (value: number) => (Number.isFinite(value) ? Math.min(inventoryLimits.maxLabelsPerLot, Math.max(1, Math.trunc(value))) : 1);

/** The QR holds only the lot code; labels never show prices or vendors. `svg` is rendered on the server from the lot code. */
export function LabelSheet({ labels }: { labels: PrintableLabel[] }) {
  const [layout, setLayout] = useState<LabelLayout>('a4-3x8');
  const [copies, setCopies] = useState<Record<string, number>>({});
  const countOf = (lotCode: string) => copies[lotCode] ?? 1;
  return (
    <div className="inventory-label-sheet" data-layout={layout}>
      <div className="inventory-label-controls">
        <label>{t('inventoryLabelLayout')}<select value={layout} onChange={(event) => setLayout(event.target.value === 'thermal-50x30' ? 'thermal-50x30' : 'a4-3x8')}><option value="a4-3x8">{t('inventoryLabelA4')}</option><option value="thermal-50x30">{t('inventoryLabelThermal')}</option></select></label>
        <table className="inventory-table">
          <tbody>{labels.map(({ lot }) => <tr key={lot.lotCode}>
            <td className="code">{lot.lotCode}</td><td>{lot.itemName}</td>
            <td className="numeric"><input aria-label={`${t('inventoryLabelCopies')} ${lot.lotCode}`} type="number" min={1} max={inventoryLimits.maxLabelsPerLot} step={1} value={countOf(lot.lotCode)} onChange={(event) => setCopies({ ...copies, [lot.lotCode]: clampCopies(Number(event.target.value)) })} /></td>
          </tr>)}</tbody>
        </table>
        <button type="button" onClick={() => window.print()}>{t('inventoryPrint')}</button>
      </div>
      <div className="inventory-labels">
        {labels.flatMap(({ lot, svg }) => Array.from({ length: countOf(lot.lotCode) }, (_, copy) => (
          <div className="inventory-label" key={`${lot.lotCode}-${copy}`}>
            <div className="inventory-label-qr" dangerouslySetInnerHTML={{ __html: svg }} />
            <div className="inventory-label-text">
              <strong>{lot.itemName}</strong>
              <span>{lot.itemCode}</span>
              <span className="code">{lot.lotCode}</span>
              {lot.expiryDate ? <span>{t('inventoryLabelExpiry')} {formatThaiDate(lot.expiryDate)}</span> : null}
              <span>{t('inventoryLabelReceived')} {formatThaiDate(lot.receivedOn)}</span>
            </div>
          </div>
        )))}
      </div>
    </div>
  );
}
