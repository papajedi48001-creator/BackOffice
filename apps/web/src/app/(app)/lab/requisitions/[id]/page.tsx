import Link from 'next/link';
import { formatBangkokDateTime } from '../../../../../lib/bangkok-time';
import { formatStock } from '../../../../../lib/lab-client';
import { labRequisitionStatusLabel } from '../../../../../lib/lab-labels';
import { labContext, LabPageMessage, formOptions } from '../../lab-page';
import { requisitionTone } from '../../lab-text';
import { RequisitionForm } from '../requisition-form';
import { DecisionButtons } from './decision-buttons';
import { IssueForm } from './issue-form';

export const dynamic = 'force-dynamic';
const TITLE = 'ใบขอเบิก';

/** One ใบขอเบิก with what the person may do next: ตัดสิน (หัวหน้า), จ่าย (ผู้ดูแลคลัง), แก้ไขส่งอีกครั้ง or ยกเลิก (ผู้ขอ). */
export default async function LabRequisitionPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await labContext({ needs: ['request', 'decide', 'issue'] });
  if (!context.ok) return <LabPageMessage title={TITLE} reason={context.reason} />;
  const { queries, member, manages, can, session, settings, certified } = context;
  const row = await queries.requisition((await params).id);
  if (!row || (member?.role === 'STAFF' && !manages && !member.sectionIds.includes(row.sectionId))) return <LabPageMessage title={TITLE} reason="forbidden" />;
  const own = row.requestedBy === session.personId;
  const mayEdit = own || manages;
  const decide = can('decide') && row.status === 'SUBMITTED';
  const cancel = mayEdit && (row.status === 'SUBMITTED' || row.status === 'RETURNED');
  const issue = can('issue') && row.status === 'APPROVED' && certified;
  const sections = settings.sections.filter((section) => section.id === row.sectionId).map(({ id, name }) => ({ id, name }));
  return <section className="lab-requisition">
    <p><Link href="/lab/requisitions">← ใบขอเบิกทั้งหมด</Link></p>
    <h2>{TITLE} {row.docNo} <span className={`status ${requisitionTone[row.status]}`}>{labRequisitionStatusLabel(row.status)}</span></h2>
    <dl className="lab-facts">
      <dt>งาน</dt><dd>{row.sectionName}</dd>
      <dt>ผู้ขอ</dt><dd>{row.requesterName} · {formatBangkokDateTime(row.requestedAt)}</dd>
      {row.note && <><dt>หมายเหตุ</dt><dd>{row.note}</dd></>}
      {row.deciderName && <><dt>ผู้พิจารณา</dt><dd>{row.deciderName}{row.decidedAt ? ` · ${formatBangkokDateTime(row.decidedAt)}` : ''}</dd></>}
      {row.decisionReason && <><dt>เหตุผล</dt><dd>{row.decisionReason}</dd></>}
      {row.issuedAt && <><dt>จ่ายเมื่อ</dt><dd>{formatBangkokDateTime(row.issuedAt)}</dd></>}
      {row.issueNote && <><dt>หมายเหตุการจ่าย</dt><dd>{row.issueNote}</dd></>}
    </dl>
    <div className="leave-table-scroll"><table>
      <thead><tr><th>วัสดุ</th><th className="lab-number">ขอ</th><th className="lab-number">จ่าย</th>{row.status === 'APPROVED' && <th className="lab-number">คลังหลักมี</th>}</tr></thead>
      <tbody>{row.lines.map((line) => <tr key={line.id}>
        <td>{line.code} {line.name}</td>
        <td className="lab-number">{formatStock(line.quantityRequested, line.useUnit, line.receiveUnit, line.unitsPerReceive)}</td>
        <td className="lab-number">{line.quantityIssued === null ? '—' : formatStock(line.quantityIssued, line.useUnit, line.receiveUnit, line.unitsPerReceive)}</td>
        {row.status === 'APPROVED' && <td className="lab-number">{formatStock(line.mainAvailable, line.useUnit, line.receiveUnit, line.unitsPerReceive)}</td>}
      </tr>)}</tbody>
    </table></div>
    <div className="lab-actions">
      {(decide || cancel) && <DecisionButtons requisitionId={row.id} docNo={row.docNo} decide={decide} cancel={cancel} own={own} />}
      {mayEdit && row.status === 'RETURNED' && <RequisitionForm sections={sections} items={formOptions(settings).items} requisition={{ id: row.id, sectionId: row.sectionId, note: row.note, lines: row.lines.map((line) => ({ itemId: line.itemId, quantity: line.quantityRequested })) }} />}
      {issue && <IssueForm requisitionId={row.id} lines={row.lines.map((line) => ({ id: line.id, code: line.code, name: line.name, useUnit: line.useUnit, quantityRequested: line.quantityRequested }))} />}
    </div>
  </section>;
}
