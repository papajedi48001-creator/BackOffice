import { InventoryQueries } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { getSharedDatabase } from '../../../../lib/database';
import { requireInventoryPage } from '../inventory-actor';
import { ItemForms } from './item-forms';

export default async function InventoryItemsPage() {
  await requireInventoryPage('inventory.item.manage');
  const database = getSharedDatabase();
  if (!database) return <section><h2>{t('inventoryItemsTitle')}</h2><p role="alert">{t('inventoryActionFailed')}</p></section>;
  const queries = new InventoryQueries(database);
  const [items, categories] = await Promise.all([queries.listItems(), queries.listCategories()]);
  return <section><h2>{t('inventoryItemsTitle')}</h2><ItemForms items={items} categories={categories} /></section>;
}
