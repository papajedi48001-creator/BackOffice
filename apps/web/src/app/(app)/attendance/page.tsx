import { redirect } from 'next/navigation';
import { canManageAttendance, canManageAttendanceDevices, canReadAttendanceAudit } from '@backoffice/core';
import { attendanceText } from '../../../lib/attendance-labels';
import { leaveSession } from '../leave/leave-page';

export const dynamic = 'force-dynamic';

/** ระบบลงเวลา: opens the first page this person may use. ลงเวลา itself (หน้าของฉัน) arrives in a later delivery step. */
export default async function AttendancePage() {
  const session = await leaveSession();
  if (!session) return null;
  if (canManageAttendance(session)) redirect('/attendance/settings');
  if (canManageAttendanceDevices(session)) redirect('/attendance/devices');
  if (canReadAttendanceAudit(session)) redirect('/attendance/audit');
  return <section><h2>{attendanceText.title}</h2><p>{attendanceText.noSection}</p></section>;
}
