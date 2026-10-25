import Link from 'next/link';
import { InventoryQueries } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { bangkokToday } from '../../../../../lib/bangkok-time';
import { getSharedDatabase } from '../../../../../lib/database';
import { canInventory } from '../../../../../lib/inventory-access';
import { requireInventoryPage } from '../../inventory-actor';
import { toScanItem } from '../../scan-items';
import { DeliveryForm } from './delivery-form';

export default async function NewInventoryReceiptPage() {
  const { subject } = await requireInventoryPage('inventory.stock.receive');
  const database = getSharedDatabase();
  if (!database) return <section><h2>{t('inventoryReceiptNewTitle')}</h2><p role="alert">{t('inventoryActionFailed')}</p></section>;
  const queries = new InventoryQueries(database);
  const [opening, items, vendors] = await Promise.all([queries.opening(), queries.listItems(), queries.listVendors()]);
  if (opening?.status !== 'CERTIFIED') return <section><h2>{t('inventoryReceiptNewTitle')}</h2><p>{t('inventoryOpeningFirstNote')}</p><Link href="/inventory/opening">{t('inventoryOpeningLink')}</Link></section>;
  return <section>
    <h2>{t('inventoryReceiptNewTitle')}</h2>
    <DeliveryForm vendors={vendors} items={items.map(toScanItem)} today={bangkokToday()} canBindBarcode={canInventory(subject, 'inventory.item.manage')} />
  </section>;
}
