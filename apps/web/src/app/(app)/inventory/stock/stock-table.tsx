import Link from 'next/link';
import type { StockRow } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { formatBaht, formatQuantity, formatThaiDate } from '../inventory-format';

export function StockTable({ rows }: { rows: StockRow[] }) {
  if (rows.length === 0) return <p>{t('inventoryNoStock')}</p>;
  return (
    <table className="inventory-table">
      <thead><tr><th>{t('inventoryCode')}</th><th>{t('inventoryName')}</th><th>{t('inventoryCategory')}</th><th className="numeric">{t('inventoryOnHand')}</th><th className="numeric">{t('inventoryValue')}</th><th>{t('inventoryNearestExpiry')}</th><th>{t('inventoryStatus')}</th></tr></thead>
      <tbody>{rows.map((row) => (
        <tr key={row.itemId}>
          <td className="code">{row.code}</td>
          <td><Link href={`/inventory/stock/${row.itemId}`}>{row.name}</Link></td>
          <td>{row.categoryName}</td>
          <td className="numeric">{formatQuantity(row.onHand, row.issueUnit)}</td>
          <td className="numeric">{formatBaht(row.value)}</td>
          <td>{row.nearestExpiry ? formatThaiDate(row.nearestExpiry) : '–'}</td>
          <td>
            {row.belowReorder ? <span className="inventory-flag inventory-flag-alert">{t('inventoryBelowReorder')}</span> : null}
            {!row.isActive ? <span className="inventory-flag">{t('inventoryInactive')}</span> : null}
          </td>
        </tr>
      ))}</tbody>
    </table>
  );
}
