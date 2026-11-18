import { moneyContext, MoneyPageMessage } from '../money-page';
import { FdhDashboard } from './fdh-dashboard';

export const dynamic = 'force-dynamic';

/** ติดตามกองทุนย่อย FDH: for ผู้ดูแล Smart Money and members given the page; the documents API checks the same again. */
export default async function FdhPage() {
  const context = await moneyContext({ page: 'fdh' });
  if (!context.ok) return <MoneyPageMessage title="ติดตามกองทุนย่อย FDH" reason={context.reason} />;
  return <FdhDashboard canManage={context.manages} />;
}
