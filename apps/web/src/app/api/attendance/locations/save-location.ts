import { attendanceLocationInputSchema } from '@backoffice/contracts';
import { attendanceResult, attendanceSettings, canManageAttendanceDevices, forbidden, readInput, withSessionAndDatabase } from '../attendance-route';

/** Adds (`id` null) or edits a จุดลงเวลา; whoever manages the boxes. */
export function saveLocation(request: Request, id: string | null): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!canManageAttendanceDevices(session)) return forbidden();
    const input = await readInput(request, attendanceLocationInputSchema);
    if (!input.ok) return input.response;
    return attendanceResult(await attendanceSettings(database).saveLocation(session.personId, id, input.value), id ? 200 : 201);
  });
}
