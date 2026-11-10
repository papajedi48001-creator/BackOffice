import { AttendanceSettingsQueries, canManageAttendance } from '@backoffice/core';
import { attendanceContext, AttendancePageMessage } from '../attendance-page';
import { SettingsForm, settingLabels, ShiftTypeForm } from './settings-forms';

export const dynamic = 'force-dynamic';
const TITLE = 'ตั้งค่าระบบลงเวลา';
const onOff = (active: boolean) => active ? <span className="status status-approved">เปิดใช้</span> : <span className="status status-cancelled">ปิดใช้</span>;

/** ตั้งค่า, for ผู้จัดการระบบลงเวลา: ค่าตั้ง and ประเภทเวร. */
export default async function AttendanceSettingsPage() {
  const context = await attendanceContext(canManageAttendance);
  if (!context.ok) return <AttendancePageMessage title={TITLE} reason={context.reason} />;
  const queries = new AttendanceSettingsQueries(context.database);
  const [settings, shiftTypes] = await Promise.all([queries.settings(), queries.shiftTypes()]);
  return <section className="attendance-page">
    <h2>{TITLE}</h2>
    <section aria-labelledby="attendance-shift-types">
      <h3 id="attendance-shift-types">ประเภทเวร</h3>
      {shiftTypes.length === 0 ? <p>ยังไม่มีประเภทเวร</p> : <div className="leave-table-scroll"><table>
        <thead><tr><th>ชื่อ</th><th>เวลา</th><th>ลงเข้าได้ก่อน</th><th>ผ่อนผันสาย / กลับก่อน</th><th>สถานะ</th><th></th></tr></thead>
        <tbody>{shiftTypes.map((shift) => <tr key={shift.id}>
          <td><span className="attendance-shift-pill" style={{ '--shift': shift.colorHex } as React.CSSProperties}>{shift.name}</span></td>
          <td>{shift.startTime}–{shift.endTime}{shift.overnight && ' (ข้ามวัน)'}</td>
          <td>{shift.earlyWindowMinutes} นาที</td>
          <td>{shift.lateGraceMinutes} / {shift.earlyLeaveGraceMinutes} นาที</td>
          <td>{onOff(shift.isActive)}</td>
          <td className="request-actions"><ShiftTypeForm row={shift} /></td>
        </tr>)}</tbody>
      </table></div>}
      <ShiftTypeForm />
    </section>
    <section aria-labelledby="attendance-settings">
      <h3 id="attendance-settings">ค่าตั้ง</h3>
      <dl className="attendance-settings-list">{settingLabels.map(({ key, label }) => <div key={key}><dt>{label}</dt><dd>{settings[key]}</dd></div>)}</dl>
      <SettingsForm settings={settings} />
    </section>
  </section>;
}
