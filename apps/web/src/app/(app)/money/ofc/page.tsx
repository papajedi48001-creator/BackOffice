import { isAdmin } from '@backoffice/core';
import { moneyContext, MoneyPageMessage } from '../money-page';
import { loadOfcPage } from './ofc-load';
import { OfcMonitor } from './ofc-monitor';

export const dynamic = 'force-dynamic';
const TITLE = 'Monitor Instrument OFC';

/** Monitor Instrument OFC: read live from HOSxP (read only) plus the imported REP / Statement; members given the page or Smart Money managers. */
export default async function OfcPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await moneyContext({ page: 'ofc' });
  if (!context.ok) return <MoneyPageMessage title={TITLE} reason={context.reason} />;
  const data = await loadOfcPage(context.database, context.session, await searchParams);
  if (!data.outcome) return <MoneyPageMessage title={TITLE} reason="forbidden" />;
  return <OfcMonitor start={data.start} end={data.end} presets={data.presets} periodText={data.periodText} canManage={context.manages} showConnectionLink={isAdmin(context.session)} outcome={data.outcome} />;
}
