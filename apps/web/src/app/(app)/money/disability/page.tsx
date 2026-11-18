import { moneyContext, MoneyPageMessage } from '../money-page';
import { DpDashboard } from './dp-dashboard';

export const dynamic = 'force-dynamic';

/** Point ฟื้นฟูผู้พิการ: for ผู้ดูแล Smart Money and members given the page; the records API checks the same again. */
export default async function DisabilityPointPage() {
  const context = await moneyContext({ page: 'disability' });
  if (!context.ok) return <MoneyPageMessage title="Point ฟื้นฟูผู้พิการ" reason={context.reason} />;
  return <DpDashboard canManage={context.manages} />;
}
