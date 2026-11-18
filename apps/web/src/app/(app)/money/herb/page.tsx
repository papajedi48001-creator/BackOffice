import { isAdmin } from '@backoffice/core';
import { moneyContext, MoneyPageMessage } from '../money-page';
import { HerbDashboard } from './herb-dashboard';
import { loadHerbPage } from './herb-load';

export const dynamic = 'force-dynamic';

/** การจ่ายยาสมุนไพร: read live from HOSxP (read only) plus รับจริง from the stored REP; members given the page or Smart Money managers. */
export default async function HerbPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await moneyContext({ page: 'herb' });
  if (!context.ok) return <MoneyPageMessage title="การจ่ายยาสมุนไพร" reason={context.reason} />;
  const data = await loadHerbPage(context.database, context.session, await searchParams);
  return <HerbDashboard start={data.start} end={data.end} presets={data.presets} periodText={data.periodText} pointBaht={data.pointBaht} canUpload={context.manages} showConnectionLink={isAdmin(context.session)} outcome={data.outcome} />;
}
