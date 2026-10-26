import Link from 'next/link';
import { notFound } from 'next/navigation';
import { InventoryQueries } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { getSharedDatabase } from '../../../../../../lib/database';
import { requireInventoryPage } from '../../../inventory-actor';
import { LabelSheet } from '../../../label-sheet';
import { printableLabels } from '../../../printable-labels';

export default async function InventoryReceiptLabelsPage({ params }: { params: Promise<{ receiptId: string }> }) {
  await requireInventoryPage('inventory.stock.receive');
  const database = getSharedDatabase();
  if (!database) return <section><h2>{t('inventoryLabelsTitle')}</h2><p role="alert">{t('inventoryActionFailed')}</p></section>;
  const { receiptId } = await params;
  const queries = new InventoryQueries(database);
  const receipt = await queries.receiptDetail(receiptId);
  if (!receipt || receipt.kind !== 'DELIVERY' || receipt.status !== 'POSTED') notFound();
  const labels = await printableLabels(await queries.labelLots(receipt.id));
  return <section>
    <div className="page-heading"><h2>{t('inventoryLabelsTitle')} {receipt.reference}</h2><nav className="page-actions"><Link href={`/inventory/receipts/${receipt.id}`}>{t('inventoryReceiptTitle')} {receipt.reference}</Link></nav></div>
    {labels.length ? <LabelSheet labels={labels} /> : <p>{t('inventoryNoLabels')}</p>}
  </section>;
}
