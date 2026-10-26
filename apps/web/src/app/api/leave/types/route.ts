import { NextResponse } from 'next/server';
import { LeaveSettingsService, canManageLeave } from '@backoffice/core';
import { leaveTypeCreateInputSchema } from '@backoffice/contracts';
import { forbidden, leaveResult, readInput, withSessionAndDatabase } from '../leave-route';

/** Staff see the active ประเภทการลา for the form; HR sees every type. */
export async function GET(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => NextResponse.json({ types: await new LeaveSettingsService(database).listTypes({ activeOnly: !canManageLeave(session) }) }));
}

export async function POST(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!canManageLeave(session)) return forbidden();
    const input = await readInput(request, leaveTypeCreateInputSchema);
    if (!input.ok) return input.response;
    return leaveResult(await new LeaveSettingsService(database).createType(input.value, session.personId), 201);
  });
}
