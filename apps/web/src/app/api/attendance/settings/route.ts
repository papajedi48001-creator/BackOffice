import { attendanceSettingsInputSchema } from '@backoffice/contracts';
import { attendanceResult, attendanceSettings, canManageAttendance, forbidden, readInput, withSessionAndDatabase } from '../attendance-route';

/** ค่าตั้งระบบลงเวลา; ผู้จัดการระบบลงเวลา only. */
export function PUT(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!canManageAttendance(session)) return forbidden();
    const input = await readInput(request, attendanceSettingsInputSchema);
    if (!input.ok) return input.response;
    return attendanceResult(await attendanceSettings(database).saveSettings(session.personId, input.value));
  });
}
