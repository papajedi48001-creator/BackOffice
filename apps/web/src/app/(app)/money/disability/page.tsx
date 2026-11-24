import { isAdmin, moneyCan } from '@backoffice/core';
import { moneyContext, MoneyPageMessage } from '../money-page';
import { OfcMonitor } from '../ofc/ofc-monitor';
import { loadDisabilityPage } from './disability-load';
import { DisabilityTabs } from './disability-tabs';
import { DpDashboard } from './dp-dashboard';
import { ImcMonitor } from './imc-monitor';

export const dynamic = 'force-dynamic';
const TITLE = 'กองทุนฟื้นฟูสมรรถภาพ';

/**
 * กองทุนฟื้นฟูสมรรถภาพ: การ์ดเมนู for Monitor IMC, Monitor Instrument OFC and บริการฟื้นฟู (Point), then the open one. Each tab is
 * shown only to whom may open it (disability page / ofc page, or ผู้ดูแล Smart Money); the APIs check the same again.
 */
export default async function DisabilityFundPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await moneyContext();
  if (!context.ok) return <MoneyPageMessage title={TITLE} reason={context.reason} />;
  const data = await loadDisabilityPage(context, await searchParams, (page) => moneyCan(context.member, context.manages, page));
  if (!data) return <MoneyPageMessage title={TITLE} reason="forbidden" />;
  return <>
    <section className="nhso imc-page">
      <h2>{TITLE}</h2>
      <DisabilityTabs cards={data.cards} />
      {data.current === 'imc' && <ImcMonitor canManage={context.manages} />}
    </section>
    {data.current === 'ofc' && (data.ofc?.outcome
      ? <OfcMonitor start={data.ofc.start} end={data.ofc.end} presets={data.ofc.presets} periodText={data.ofc.periodText} canManage={context.manages} showConnectionLink={isAdmin(context.session)} outcome={data.ofc.outcome} />
      : <p className="money-alert" role="alert">โหลดข้อมูล Instrument OFC ไม่สำเร็จ ลองใหม่อีกครั้ง</p>)}
    {data.current === 'dp' && <DpDashboard canManage={context.manages} />}
  </>;
}
