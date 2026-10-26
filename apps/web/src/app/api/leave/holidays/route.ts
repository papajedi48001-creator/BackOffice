import { NextResponse } from 'next/server';
import { LeaveSettingsService, canManageLeave } from '@backoffice/core';
import { leaveHolidayInputSchema } from '@backoffice/contracts';
import { forbidden, invalidInput, leaveResult, readInput, withSessionAndDatabase } from '../leave-route';

/** วันหยุดราชการ of one CE calendar year; every signed-in person may read them to plan leave. */
export async function GET(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (_session, database) => {
    const year = Number(new URL(request.url).searchParams.get('year') ?? new Date().getUTCFullYear());
    if (!Number.isInteger(year) || year < 2000 || year > 2200) return invalidInput(['year']);
    return NextResponse.json({ holidays: await new LeaveSettingsService(database).listHolidays(year) });
  });
}

export async function POST(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!canManageLeave(session)) return forbidden();
    const input = await readInput(request, leaveHolidayInputSchema);
    if (!input.ok) return input.response;
    return leaveResult(await new LeaveSettingsService(database).addHoliday(input.value, session.personId), 201);
  });
}
