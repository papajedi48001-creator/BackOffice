import { attendanceDevices, attendanceResult, canManageAttendanceDevices, forbidden, routeId, withSessionAndDatabase } from '../../../attendance-route';

/** ถอนสิทธิ์กล่อง: its signed requests stop working at once. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const id = await routeId(context);
  return withSessionAndDatabase(request, async (session, database) => {
    if (!canManageAttendanceDevices(session)) return forbidden();
    return attendanceResult(await attendanceDevices(database).revoke(session.personId, id));
  });
}
