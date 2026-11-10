import { attendanceShiftTypeInputSchema } from '@backoffice/contracts';
import { attendanceResult, attendanceSettings, canManageAttendance, forbidden, readInput, withSessionAndDatabase } from '../attendance-route';

/** Adds (`id` null) or edits a ประเภทเวร; ผู้จัดการระบบลงเวลา only. */
export function saveShiftType(request: Request, id: string | null): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!canManageAttendance(session)) return forbidden();
    const input = await readInput(request, attendanceShiftTypeInputSchema);
    if (!input.ok) return input.response;
    return attendanceResult(await attendanceSettings(database).saveShiftType(session.personId, id, input.value), id ? 200 : 201);
  });
}
