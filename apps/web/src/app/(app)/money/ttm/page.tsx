import { isAdmin } from '@backoffice/core';
import { moneyContext, MoneyPageMessage } from '../money-page';
import { TtmDashboard } from './ttm-dashboard';
import { loadTtmPage } from './ttm-load';

export const dynamic = 'force-dynamic';

/** monitor แพทย์แผนไทย: read live from HOSxP (read only) for the chosen range; members given the page or Smart Money managers. */
export default async function TtmPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await moneyContext({ page: 'ttm' });
  if (!context.ok) return <MoneyPageMessage title="monitor แพทย์แผนไทย" reason={context.reason} />;
  const data = await loadTtmPage(context.database, await searchParams);
  return <TtmDashboard start={data.start} end={data.end} presets={data.presets} periodText={data.periodText} afterFrom={data.rules.afterHoursFrom} showConnectionLink={isAdmin(context.session)} outcome={data.outcome} />;
}
