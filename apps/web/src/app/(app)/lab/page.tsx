import Link from 'next/link';
import { formatCount } from '../../../lib/lab-client';
import { labRoleLabel } from '../../../lib/lab-labels';
import { labContext, LabPageMessage, NotCertifiedBanner, formOptions } from './lab-page';
import { labDate, labDayOf } from './lab-text';
import { UsageForm } from './usage/usage-form';

export const dynamic = 'force-dynamic';
const TITLE = 'วัสดุคงคลัง Lab';

/** ภาพรวม: what waits for this person (รออนุมัติ for the หัวหน้า, รอจ่าย for the ผู้ดูแลคลัง, their งาน's ใบขอเบิก) and the large ตัดใช้ button. */
export default async function LabOverviewPage() {
  const context = await labContext();
  if (!context.ok) return <LabPageMessage title={TITLE} reason={context.reason} />;
  const { queries, member, manages, can, stores, settings, certified, today } = context;
  const decide = can('decide') ? await queries.requisitions({ status: ['SUBMITTED'], limit: 20 }) : [];
  const issue = can('issue') ? await queries.requisitions({ status: ['APPROVED'], limit: 20 }) : [];
  const mine = member?.role === 'STAFF' ? await queries.requisitions({ sectionIds: member.sectionIds, status: ['SUBMITTED', 'RETURNED', 'APPROVED'], limit: 20 }) : [];
  const useStores = stores('use').filter((store) => store.sectionId !== null);
  const options = formOptions(settings);
  const list = (heading: string, rows: typeof decide) => <section className="lab-block" aria-label={heading}>
    <h3>{heading} <span className="lab-count">{formatCount(rows.length)}</span></h3>
    {rows.length === 0 ? <p className="lab-empty">ไม่มีรายการ</p> : <ul className="lab-doc-list">{rows.map((row) => <li key={row.id}>
      <Link href={`/lab/requisitions/${row.id}`}>{row.docNo}</Link> <span>{row.sectionName}</span> <span>{row.requesterName}</span> <time>{labDate(labDayOf(row.requestedAt))}</time>
    </li>)}</ul>}
  </section>;
  return <section className="lab-overview">
    <h2>{TITLE}</h2>
    <NotCertifiedBanner certified={certified} />
    <p className="lab-me">{manages ? 'ผู้จัดการวัสดุคงคลัง Lab' : member ? labRoleLabel(member.role) : ''}</p>
    {useStores.length > 0 && <div className="lab-primary"><UsageForm large stores={useStores} items={options.items} usageTypes={options.usageTypes} today={today} disabled={!certified} /></div>}
    {can('decide') && list('ใบขอเบิกรออนุมัติ', decide)}
    {can('issue') && list('ใบขอเบิกรอจ่าย', issue)}
    {member?.role === 'STAFF' && list('ใบขอเบิกของงานฉัน', mine)}
  </section>;
}
