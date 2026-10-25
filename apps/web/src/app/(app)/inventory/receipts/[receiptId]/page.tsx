import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { InventoryQueries } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { getSharedDatabase } from '../../../../../lib/database';
import { requireInventoryPage } from '../../inventory-actor';
import { formatThaiDate, formatThaiDateTime } from '../../inventory-format';
import { ReceiptView } from '../../receipt-view';
import { VoidForm } from './void-form';

export default async function InventoryReceiptPage({ params }: { params: Promise<{ receiptId: string }> }) {
  await requireInventoryPage('inventory.stock.receive');
  const database = getSharedDatabase();
  if (!database) return <section><h2>{t('inventoryReceiptTitle')}</h2><p role="alert">{t('inventoryActionFailed')}</p></section>;
  const { receiptId } = await params;
  const receipt = await new InventoryQueries(database).receiptDetail(receiptId);
  if (!receipt) notFound();
  if (receipt.kind === 'OPENING') redirect('/inventory/opening');
  return <section>
    <div className="page-heading">
      <h2>{t('inventoryReceiptTitle')} {receipt.reference}</h2>
      <nav className="page-actions"><Link href="/inventory/receipts">{t('inventoryReceipts')}</Link>{receipt.status === 'POSTED' ? <Link className="button-link" href={`/inventory/receipts/${receipt.id}/labels`}>{t('inventoryLabels')}</Link> : null}</nav>
    </div>
    <dl className="inventory-facts">
      <div><dt>{t('inventoryStatus')}</dt><dd>{t(`inventoryStatus${receipt.status}` as const)}</dd></div>
      <div><dt>{t('inventoryVendors')}</dt><dd>{receipt.vendorName ?? '–'}</dd></div>
      <div><dt>{t('inventoryDocumentNo')}</dt><dd>{receipt.documentNo ?? '–'}</dd></div>
      <div><dt>{t('inventoryReceivedOn')}</dt><dd>{formatThaiDate(receipt.receivedOn)}</dd></div>
      <div><dt>{t('inventoryHistoryPOSTED')}</dt><dd>{receipt.postedAt ? formatThaiDateTime(receipt.postedAt) : '–'}{receipt.createdByName ? ` · ${receipt.createdByName}` : ''}</dd></div>
    </dl>
    <ReceiptView receipt={receipt} />
    {receipt.status === 'POSTED' ? <VoidForm receiptId={receipt.id} /> : null}
  </section>;
}
