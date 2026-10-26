import Link from 'next/link';
import { InventoryQueries } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { getSharedDatabase } from '../../../../lib/database';
import { canInventory } from '../../../../lib/inventory-access';
import { requireInventoryPage } from '../inventory-actor';
import type { EditorLine } from '../receipt-lines-editor';
import { ReceiptHistory, ReceiptView } from '../receipt-view';
import { toScanItem } from '../scan-items';
import { OpeningDecision, OpeningEditor, StartOpening } from './opening-actions';
import { openingView } from './opening-view';

export default async function InventoryOpeningPage() {
  const { subject } = await requireInventoryPage('inventory.stock.receive', 'inventory.opening.certify');
  const database = getSharedDatabase();
  if (!database) return <section><h2>{t('inventoryOpeningTitle')}</h2><p role="alert">{t('inventoryActionFailed')}</p></section>;
  const queries = new InventoryQueries(database);
  const [opening, items] = await Promise.all([queries.opening(), queries.listItems()]);
  const view = openingView(opening?.status ?? null, { canEdit: canInventory(subject, 'inventory.stock.receive'), canDecide: canInventory(subject, 'inventory.opening.certify') });
  const scanItems = items.map(toScanItem);
  const byId = new Map(scanItems.map((item) => [item.id, item]));
  const initialLines: EditorLine[] = (opening?.lines ?? []).flatMap((line) => {
    const item = byId.get(line.itemId);
    return item ? [{ key: line.id, item, unitKind: line.enteredUnitKind, quantity: String(line.enteredQuantity), unitPrice: line.enteredUnitPrice, manufacturerLotNo: line.manufacturerLotNo ?? '', expiryDate: line.expiryDate ?? '' }] : [];
  });
  return <section>
    <div className="page-heading">
      <h2>{t('inventoryOpeningTitle')}{opening ? ` ${opening.reference}` : ''}</h2>
      {view === 'certified' && opening ? <nav className="page-actions"><Link className="button-link" href="/inventory/opening/labels">{t('inventoryLabels')}</Link></nav> : null}
    </div>
    {opening ? <p><strong>{t(`inventoryStatus${opening.status}` as const)}</strong></p> : null}
    {view === 'start' ? <StartOpening /> : null}
    {view === 'missing' ? <p>{t('inventoryOpeningMissingNote')}</p> : null}
    {view === 'draft' ? <p>{t('inventoryOpeningDraftNote')}</p> : null}
    {view === 'waiting' ? <p>{t('inventoryOpeningWaitingNote')}</p> : null}
    {view === 'certified' ? <p>{t('inventoryOpeningCertifiedNote')}</p> : null}
    {view === 'edit' ? <OpeningEditor initialLines={initialLines} items={scanItems} canBindBarcode={canInventory(subject, 'inventory.item.manage')} /> : null}
    {opening && view !== 'edit' ? <ReceiptView receipt={opening} /> : null}
    {opening && view === 'edit' ? <ReceiptHistory history={opening.history} /> : null}
    {view === 'decide' ? <OpeningDecision /> : null}
  </section>;
}
