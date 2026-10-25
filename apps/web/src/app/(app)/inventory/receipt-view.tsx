import type { ReceiptDetail } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { formatBaht, formatQuantity, formatThaiDate, formatThaiDateTime } from './inventory-format';

/** Read-only lines and history of a delivery or the opening balance. */
export function ReceiptView({ receipt }: { receipt: ReceiptDetail }) {
  return <>
    <table className="inventory-table">
      <thead><tr><th>#</th><th>{t('inventoryName')}</th><th className="numeric">{t('inventoryQuantity')}</th><th className="numeric">{t('inventoryUnitPrice')}</th><th className="numeric">{t('inventoryOnHand')}</th><th>{t('inventoryManufacturerLot')}</th><th>{t('inventoryExpiry')}</th><th>{t('inventoryLotCode')}</th><th className="numeric">{t('inventoryLineTotal')}</th></tr></thead>
      <tbody>{receipt.lines.map((line) => <tr key={line.id}>
        <td>{line.lineNo}</td>
        <td><span className="code">{line.itemCode}</span> {line.itemName}</td>
        <td className="numeric">{formatQuantity(line.enteredQuantity, line.enteredUnitKind === 'PURCHASE' ? line.purchaseUnit : line.issueUnit)}</td>
        <td className="numeric">{formatBaht(line.enteredUnitPrice)}</td>
        <td className="numeric">{formatQuantity(line.issueQuantity, line.issueUnit)}</td>
        <td>{line.manufacturerLotNo ?? '–'}</td>
        <td>{line.expiryDate ? formatThaiDate(line.expiryDate) : '–'}</td>
        <td className="code">{line.lotCode ?? '–'}</td>
        <td className="numeric">{formatBaht(line.lineTotal)}</td>
      </tr>)}</tbody>
      <tfoot><tr><td colSpan={8}>{t('inventoryTotal')}</td><td className="numeric">{formatBaht(receipt.total)}</td></tr></tfoot>
    </table>
    <ReceiptHistory history={receipt.history} />
  </>;
}

export function ReceiptHistory({ history }: { history: ReceiptDetail['history'] }) {
  if (!history.length) return null;
  return <>
    <h3>{t('inventoryHistory')}</h3>
    <ol className="inventory-history">{history.map((entry, index) => <li key={index}><strong>{t(`inventoryHistory${entry.action}` as const)}</strong> · {formatThaiDateTime(entry.createdAt)}{entry.actorName ? ` · ${entry.actorName}` : ''}{entry.reason ? <p>{entry.reason}</p> : null}</li>)}</ol>
  </>;
}
