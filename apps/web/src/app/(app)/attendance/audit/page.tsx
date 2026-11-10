import { canReadAttendanceAudit } from '@backoffice/core';
import { attendanceContext, AttendancePageMessage } from '../attendance-page';
import { VerifyChainButton } from './verify-chain-button';

export const dynamic = 'force-dynamic';
const TITLE = 'บันทึกตรวจสอบระบบลงเวลา';
const thai = (value: Date | string) => new Date(value).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'medium' });

/** ผู้ตรวจสอบระบบลงเวลา: the latest audited actions of the module and the hash-chain check. Reads only. */
export default async function AttendanceAuditPage() {
  const context = await attendanceContext(canReadAttendanceAudit);
  if (!context.ok) return <AttendancePageMessage title={TITLE} reason={context.reason} />;
  const rows = await context.database.query<{ seq: number; action: string; createdAt: Date; actorName: string | null; targetType: string }>(
    `SELECT c.seq, a.action, a.created_at AS createdAt, p.display_name AS actorName, a.target_type AS targetType FROM attendance_hash_chain c
     JOIN audit_event a ON c.record_type = 'audit_event' AND a.id = c.record_id LEFT JOIN person p ON p.id = a.actor_person_id ORDER BY c.seq DESC LIMIT 100`
  );
  return <section className="attendance-page">
    <h2>{TITLE}</h2>
    <p>ทุกรายการเชื่อมกันเป็นสายแฮช ถ้ามีการแก้หรือลบข้อมูลย้อนหลัง การตรวจสอบจะบอกลำดับที่ผิดปกติ</p>
    <VerifyChainButton />
    {rows.length === 0 ? <p>ยังไม่มีรายการ</p> : <div className="leave-table-scroll"><table>
      <thead><tr><th>ลำดับ</th><th>เวลา</th><th>ผู้ทำรายการ</th><th>รายการ</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.seq}><td>{row.seq}</td><td>{thai(row.createdAt)}</td><td>{row.actorName ?? 'กล่องลงเวลา'}</td><td><code>{row.action}</code></td></tr>)}</tbody>
    </table></div>}
  </section>;
}
