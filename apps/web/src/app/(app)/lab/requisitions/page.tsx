import Link from 'next/link';
import { labRequisitionStatusLabel } from '../../../../lib/lab-labels';
import { labContext, LabPageMessage, NotCertifiedBanner, formOptions } from '../lab-page';
import { labDate, requisitionTone } from '../lab-text';
import { RequisitionForm } from './requisition-form';

export const dynamic = 'force-dynamic';
const TITLE = 'ใบขอเบิก';

/** ใบขอเบิก: a เจ้าหน้าที่ Lab sees their งาน's, the หัวหน้า and ผู้ดูแลคลัง see all. */
export default async function LabRequisitionsPage() {
  const context = await labContext({ needs: ['request', 'decide', 'issue'] });
  if (!context.ok) return <LabPageMessage title={TITLE} reason={context.reason} />;
  const { queries, member, stores, settings, certified } = context;
  const rows = await queries.requisitions({ ...(member?.role === 'STAFF' ? { sectionIds: member.sectionIds } : {}), limit: 200 });
  const sections = stores('request').filter((store) => store.sectionId !== null).map((store) => ({ id: store.sectionId!, name: store.name }));
  return <section className="lab-requisitions">
    <h2>{TITLE}</h2>
    <NotCertifiedBanner certified={certified} />
    {sections.length > 0 && <div className="lab-actions"><RequisitionForm sections={sections} items={formOptions(settings).items} disabled={!certified} /></div>}
    {rows.length === 0 ? <p className="lab-empty">ยังไม่มีใบขอเบิก</p> : <div className="leave-table-scroll"><table>
      <thead><tr><th>เลขที่</th><th>งาน</th><th>ผู้ขอ</th><th>วันที่ขอ</th><th className="lab-number">รายการ</th><th>สถานะ</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.id}>
        <td><Link href={`/lab/requisitions/${row.id}`}>{row.docNo}</Link></td><td>{row.sectionName}</td><td>{row.requesterName}</td><td>{labDate(row.requestedAt.slice(0, 10))}</td>
        <td className="lab-number">{row.lineCount}</td><td><span className={`status ${requisitionTone[row.status]}`}>{labRequisitionStatusLabel(row.status)}</span></td>
      </tr>)}</tbody>
    </table></div>}
  </section>;
}
