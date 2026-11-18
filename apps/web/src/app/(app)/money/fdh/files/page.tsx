import Link from 'next/link';
import { FdhDocumentService } from '@backoffice/core';
import { getNationalIdProtector } from '../../../../../lib/national-id';
import { moneyContext, MoneyPageMessage } from '../../money-page';
import { FdhFiles } from './fdh-files';
import { FdhUpload } from './fdh-upload';

export const dynamic = 'force-dynamic';
const TITLE = 'จัดการไฟล์ REP / STM (FDH)';

/** อัปโหลดไฟล์ REP / STM and the stored documents; ผู้ดูแล Smart Money only (checked here and again by every API call). */
export default async function FdhFilesPage() {
  const context = await moneyContext({ page: 'manage' });
  if (!context.ok) return <MoneyPageMessage title={TITLE} reason={context.reason} />;
  const listed = await new FdhDocumentService(context.database, getNationalIdProtector()).list(context.session);
  return <section className="nhso">
    <h2>{TITLE}</h2>
    <p><Link href="/money/fdh">← กลับไปหน้า dashboard</Link></p>
    {!getNationalIdProtector() && <p className="money-alert" role="alert">ยังไม่ได้ตั้งค่ากุญแจเข้ารหัสข้อมูลผู้ป่วย (NATIONAL_ID_ENCRYPTION_KEY) จึงนำเข้าไฟล์ไม่ได้ ติดต่อผู้ดูแลระบบ</p>}
    <FdhUpload />
    <FdhFiles reps={listed.ok ? listed.reps : []} stms={listed.ok ? listed.stms : []} />
  </section>;
}
