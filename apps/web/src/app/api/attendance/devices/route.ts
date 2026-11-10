import { attendanceDeviceInputSchema } from '@backoffice/contracts';
import { attendanceDevices, attendanceResult, canManageAttendanceDevices, forbidden, readInput, withSessionAndDatabase } from '../attendance-route';

/** A new กล่องลงเวลา; the answer carries its รหัสจับคู่, shown once. */
export function POST(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!canManageAttendanceDevices(session)) return forbidden();
    const input = await readInput(request, attendanceDeviceInputSchema);
    if (!input.ok) return input.response;
    return attendanceResult(await attendanceDevices(database).create(session.personId, input.value), 201);
  });
}
