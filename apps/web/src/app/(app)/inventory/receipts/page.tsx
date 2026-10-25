import Link from 'next/link';
import { InventoryQueries } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { getSharedDatabase } from '../../../../lib/database';
import { requireInventoryPage } from '../inventory-actor';
import { formatBaht, formatThaiDate } from '../inventory-format';

export default async function InventoryReceiptsPage() {
  await requireInventoryPage('inventory.stock.receive');
  const database = getSharedDatabase();
  if (!database) return <section><h2>{t('inventoryReceipts')}</h2><p role="alert">{t('inventoryActionFailed')}</p></section>;
  const receipts = await new InventoryQueries(database).listReceipts();
  return <section>
    <div className="page-heading"><h2>{t('inventoryReceipts')}</h2><nav className="page-actions"><Link className="button-link" href="/inventory/receipts/new">{t('inventoryNewReceipt')}</Link></nav></div>
    {receipts.length ? <table className="inventory-table">
      <thead><tr><th>{t('inventoryReference')}</th><th>{t('inventoryReceivedOn')}</th><th>{t('inventoryVendors')}</th><th className="numeric">{t('inventoryLineCount')}</th><th className="numeric">{t('inventoryTotal')}</th><th>{t('inventoryStatus')}</th></tr></thead>
      <tbody>{receipts.map((receipt) => <tr key={receipt.id}>
        <td className="code"><Link href={`/inventory/receipts/${receipt.id}`}>{receipt.reference}</Link></td>
        <td>{formatThaiDate(receipt.receivedOn)}</td>
        <td>{receipt.vendorName ?? '–'}</td>
        <td className="numeric">{receipt.lineCount}</td>
        <td className="numeric">{formatBaht(receipt.total)}</td>
        <td>{t(`inventoryStatus${receipt.status}` as const)}</td>
      </tr>)}</tbody>
    </table> : <p>{t('inventoryNoReceipts')}</p>}
  </section>;
}
