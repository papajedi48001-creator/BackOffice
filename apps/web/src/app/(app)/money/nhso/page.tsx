import { moneyContext, MoneyPageMessage } from '../money-page';
import { NhsoDashboard } from './nhso-dashboard';

export const dynamic = 'force-dynamic';

/** เงินโอน สปสช.: for ผู้ดูแล Smart Money and members given the page; the data API checks the same again. */
export default async function NhsoPage() {
  const context = await moneyContext({ page: 'nhso' });
  if (!context.ok) return <MoneyPageMessage title="เงินโอน สปสช." reason={context.reason} />;
  return <NhsoDashboard canManage={context.manages} />;
}
