import { attendanceDevices, attendanceResult, canManageAttendanceDevices, forbidden, routeId, withSessionAndDatabase } from '../../../attendance-route';

/** A fresh รหัสจับคู่ for a replaced or unpaired box. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const id = await routeId(context);
  return withSessionAndDatabase(request, async (session, database) => {
    if (!canManageAttendanceDevices(session)) return forbidden();
    return attendanceResult(await attendanceDevices(database).newPairingCode(session.personId, id));
  });
}
