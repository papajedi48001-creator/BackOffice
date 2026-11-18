import Link from 'next/link';
import { NhsoDatasetService } from '@backoffice/core';
import { moneyContext, MoneyPageMessage } from '../../money-page';
import { NhsoFiles } from './nhso-files';
import { NhsoUpload } from './nhso-upload';

export const dynamic = 'force-dynamic';
const TITLE = 'นำเข้าไฟล์เงินโอน สปสช.';

/** อัปโหลดรายงานโอนเงิน and ข้อมูลในระบบ; ผู้ดูแล Smart Money only (checked here and again by every API call). */
export default async function NhsoFilesPage() {
  const context = await moneyContext({ page: 'manage' });
  if (!context.ok) return <MoneyPageMessage title={TITLE} reason={context.reason} />;
  const listed = await new NhsoDatasetService(context.database).list(context.session);
  return <section className="nhso">
    <h2>{TITLE}</h2>
    <p><Link href="/money/nhso">← กลับไปหน้า dashboard</Link></p>
    <NhsoUpload />
    <NhsoFiles datasets={listed.ok ? listed.datasets : []} />
  </section>;
}
