import { moneyContext, MoneyPageMessage } from '../money-page';
import { DpDashboard } from './dp-dashboard';
import { ImcMonitor } from './imc-monitor';

export const dynamic = 'force-dynamic';
const TITLE = 'กองทุนฟื้นฟูสมรรถภาพ';

/** กองทุนฟื้นฟูสมรรถภาพ: Monitor IMC on top, then the บริการฟื้นฟู (Point) dashboard; for ผู้ดูแล Smart Money and members given the page. The APIs check the same again. */
export default async function DisabilityFundPage() {
  const context = await moneyContext({ page: 'disability' });
  if (!context.ok) return <MoneyPageMessage title={TITLE} reason={context.reason} />;
  return <>
    <section className="nhso imc-page"><h2>{TITLE}</h2><ImcMonitor canManage={context.manages} /></section>
    <DpDashboard canManage={context.manages} />
  </>;
}
