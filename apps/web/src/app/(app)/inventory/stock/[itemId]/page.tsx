import Link from 'next/link';
import { notFound } from 'next/navigation';
import { InventoryQueries } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { bangkokToday } from '../../../../../lib/bangkok-time';
import { getSharedDatabase } from '../../../../../lib/database';
import { requireInventoryPage } from '../../inventory-actor';
import { formatBaht, formatQuantity, formatThaiDate, formatThaiDateTime } from '../../inventory-format';

export default async function InventoryItemStockPage({ params }: { params: Promise<{ itemId: string }> }) {
  await requireInventoryPage('inventory.stock.read');
  const database = getSharedDatabase();
  if (!database) return <section><h2>{t('inventoryStockTitle')}</h2><p role="alert">{t('inventoryActionFailed')}</p></section>;
  const { itemId } = await params;
  const detail = await new InventoryQueries(database).itemDetail(itemId, bangkokToday());
  if (!detail) notFound();
  const { item, barcodes, lots, expiredLots, movements } = detail;
  const onHand = lots.reduce((sum, lot) => sum + lot.onHandQuantity, 0);
  const lotTable = (rows: typeof lots) => <table className="inventory-table">
    <thead><tr><th>{t('inventoryLotCode')}</th><th>{t('inventoryManufacturerLot')}</th><th>{t('inventoryExpiry')}</th><th className="numeric">{t('inventoryOnHand')}</th><th className="numeric">{t('inventoryUnitCost')}</th><th>{t('inventoryReceivedAt')}</th></tr></thead>
    <tbody>{rows.map((lot) => <tr key={lot.id}><td className="code">{lot.lotCode}</td><td>{lot.manufacturerLotNo ?? '–'}</td><td>{lot.expiryDate ? formatThaiDate(lot.expiryDate) : '–'}</td><td className="numeric">{formatQuantity(lot.onHandQuantity, item.issueUnit)}</td><td className="numeric">{lot.unitCost}</td><td>{formatThaiDateTime(lot.receivedAt)}</td></tr>)}</tbody>
  </table>;
  return <section>
    <div className="page-heading"><h2>{item.code} {item.name}</h2><nav className="page-actions"><Link href="/inventory/stock">{t('inventoryStockTitle')}</Link></nav></div>
    <dl className="inventory-facts">
      <div><dt>{t('inventoryCategory')}</dt><dd>{item.categoryName}</dd></div>
      <div><dt>{t('inventoryOnHand')}</dt><dd>{formatQuantity(onHand, item.issueUnit)}</dd></div>
      <div><dt>{t('inventoryPurchaseUnit')}</dt><dd>{item.purchaseUnit} = {formatQuantity(item.purchaseUnitFactor, item.issueUnit)}</dd></div>
      <div><dt>{t('inventoryReorderPoint')}</dt><dd>{formatQuantity(item.reorderPoint, item.issueUnit)}{onHand < item.reorderPoint ? <span className="inventory-flag inventory-flag-alert">{t('inventoryBelowReorder')}</span> : null}</dd></div>
      <div><dt>{t('inventoryBarcodes')}</dt><dd>{barcodes.length ? barcodes.map((barcode) => barcode.barcode).join(', ') : '–'}</dd></div>
      <div><dt>{t('inventoryStatus')}</dt><dd>{item.isActive ? t('inventoryActive') : t('inventoryInactive')}</dd></div>
    </dl>
    <h3>{t('inventoryLots')}</h3>
    {lots.length ? lotTable(lots) : <p>{t('inventoryNoStock')}</p>}
    {expiredLots.length ? <><h3>{t('inventoryExpiredLots')}</h3>{lotTable(expiredLots)}</> : null}
    <h3>{t('inventoryMovements')}</h3>
    {movements.length ? <table className="inventory-table">
      <thead><tr><th>{t('inventoryOccurredAt')}</th><th>{t('inventoryReference')}</th><th>{t('inventoryLotCode')}</th><th className="numeric">{t('inventoryQuantity')}</th><th className="numeric">{t('inventoryUnitCost')}</th><th>{t('inventoryMovementKindLabel')}</th></tr></thead>
      <tbody>{movements.map((movement) => <tr key={movement.id}><td>{formatThaiDateTime(movement.occurredAt)}</td><td className="code">{movement.reference ?? '–'}</td><td className="code">{movement.lotCode}</td><td className="numeric">{formatQuantity(movement.quantity, item.issueUnit)}</td><td className="numeric">{formatBaht(movement.unitCost)}</td><td>{t(`inventoryMovement${movement.kind}` as const)}{movement.actorName ? ` · ${movement.actorName}` : ''}</td></tr>)}</tbody>
    </table> : <p>{t('inventoryNoStock')}</p>}
  </section>;
}
