import Link from 'next/link';
import { notFound } from 'next/navigation';
import { InventoryQueries } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { getSharedDatabase } from '../../../../../lib/database';
import { requireInventoryPage } from '../../inventory-actor';
import { LabelSheet } from '../../label-sheet';
import { printableLabels } from '../../printable-labels';

export default async function InventoryOpeningLabelsPage() {
  await requireInventoryPage('inventory.stock.receive', 'inventory.opening.certify');
  const database = getSharedDatabase();
  if (!database) return <section><h2>{t('inventoryLabelsTitle')}</h2><p role="alert">{t('inventoryActionFailed')}</p></section>;
  const queries = new InventoryQueries(database);
  const opening = await queries.opening();
  if (opening?.status !== 'CERTIFIED') notFound();
  const labels = await printableLabels(await queries.labelLots(opening.id));
  return <section>
    <div className="page-heading"><h2>{t('inventoryLabelsTitle')} {opening.reference}</h2><nav className="page-actions"><Link href="/inventory/opening">{t('inventoryOpeningTitle')}</Link></nav></div>
    {labels.length ? <LabelSheet labels={labels} /> : <p>{t('inventoryNoLabels')}</p>}
  </section>;
}
