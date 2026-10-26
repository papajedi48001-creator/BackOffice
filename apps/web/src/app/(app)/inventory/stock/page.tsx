import { InventoryQueries } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { bangkokToday } from '../../../../lib/bangkok-time';
import { getSharedDatabase } from '../../../../lib/database';
import { requireInventoryPage } from '../inventory-actor';
import { StockScan } from './stock-scan';
import { StockTable } from './stock-table';

export default async function InventoryStockPage({ searchParams }: { searchParams: Promise<{ search?: string; categoryId?: string }> }) {
  await requireInventoryPage('inventory.stock.read');
  const database = getSharedDatabase();
  if (!database) return <section><h2>{t('inventoryStockTitle')}</h2><p role="alert">{t('inventoryActionFailed')}</p></section>;
  const params = await searchParams;
  const search = params.search?.trim() || undefined;
  const queries = new InventoryQueries(database);
  const [categories, rows] = await Promise.all([queries.listCategories(), queries.listStock({ search, categoryId: params.categoryId || undefined }, bangkokToday())]);
  return <section>
    <h2>{t('inventoryStockTitle')}</h2>
    <StockScan />
    <form className="inventory-toolbar" method="get">
      <label htmlFor="stock-search">{t('inventorySearch')}</label>
      <input id="stock-search" name="search" defaultValue={search ?? ''} />
      <label htmlFor="stock-category">{t('inventoryCategory')}</label>
      <select id="stock-category" name="categoryId" defaultValue={params.categoryId ?? ''}><option value="">{t('inventoryAllCategories')}</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
      <button type="submit">{t('inventorySearchButton')}</button>
    </form>
    <StockTable rows={rows} />
  </section>;
}
