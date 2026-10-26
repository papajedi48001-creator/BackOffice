import { InventoryQueries } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { getSharedDatabase } from '../../../../lib/database';
import { requireInventoryPage } from '../inventory-actor';
import { VendorForms } from './vendor-forms';

export default async function InventoryVendorsPage() {
  await requireInventoryPage('inventory.item.manage');
  const database = getSharedDatabase();
  if (!database) return <section><h2>{t('inventoryVendorsTitle')}</h2><p role="alert">{t('inventoryActionFailed')}</p></section>;
  const vendors = await new InventoryQueries(database).listVendors();
  return <section><h2>{t('inventoryVendorsTitle')}</h2><VendorForms vendors={vendors} /></section>;
}
