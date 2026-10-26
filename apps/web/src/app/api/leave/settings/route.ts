import { NextResponse } from 'next/server';
import { LeaveSettingsService, canManageLeave } from '@backoffice/core';
import { leaveSettingInputSchema } from '@backoffice/contracts';
import { forbidden, leaveResult, readInput, withSessionAndDatabase } from '../leave-route';

export async function GET(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (_session, database) => NextResponse.json({ minWorkingDaysPerMonth: await new LeaveSettingsService(database).getMinWorkingDays() }));
}

export async function PUT(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!canManageLeave(session)) return forbidden();
    const input = await readInput(request, leaveSettingInputSchema);
    if (!input.ok) return input.response;
    return leaveResult(await new LeaveSettingsService(database).setMinWorkingDays(input.value, session.personId));
  });
}
