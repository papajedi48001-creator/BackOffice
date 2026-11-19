import Link from 'next/link';
import { DpRecordService } from '@backoffice/core';
import { getNationalIdProtector } from '../../../../../lib/national-id';
import { moneyContext, MoneyPageMessage } from '../../money-page';
import { DpFiles } from './dp-files';
import { DpUpload } from './dp-upload';

export const dynamic = 'force-dynamic';
const TITLE = 'จัดการไฟล์บริการฟื้นฟู (กองทุนฟื้นฟูสมรรถภาพ)';

/** อัปโหลดไฟล์บริการฟื้นฟู and the stored ปีงบ; ผู้ดูแล Smart Money only (checked here and again by every API call). */
export default async function DpFilesPage() {
  const context = await moneyContext({ page: 'manage' });
  if (!context.ok) return <MoneyPageMessage title={TITLE} reason={context.reason} />;
  const listed = await new DpRecordService(context.database, getNationalIdProtector()).summaries(context.session);
  return <section className="nhso">
    <h2>{TITLE}</h2>
    <p><Link href="/money/disability">← กลับไปหน้า dashboard</Link></p>
    {!getNationalIdProtector() && <p className="money-alert" role="alert">ยังไม่ได้ตั้งค่ากุญแจเข้ารหัสข้อมูลผู้ป่วย (NATIONAL_ID_ENCRYPTION_KEY) จึงนำเข้าไฟล์ไม่ได้ ติดต่อผู้ดูแลระบบ</p>}
    <div className="page-actions"><DpUpload /></div>
    <DpFiles years={listed.ok ? listed.years : []} />
  </section>;
}
