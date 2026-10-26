import { NextResponse } from 'next/server';
import { LeaveSettingsService, canManageLeave } from '@backoffice/core';
import { leaveEntitlementInputSchema } from '@backoffice/contracts';
import { forbidden, leaveResult, readInput, withSessionAndDatabase } from '../leave-route';

const entitlementKeySchema = leaveEntitlementInputSchema.pick({ employmentTypeId: true, leaveTypeId: true }).strict();

export async function GET(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!canManageLeave(session)) return forbidden();
    return NextResponse.json({ entitlements: await new LeaveSettingsService(database).listEntitlements() });
  });
}

export async function PUT(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!canManageLeave(session)) return forbidden();
    const input = await readInput(request, leaveEntitlementInputSchema);
    if (!input.ok) return input.response;
    return leaveResult(await new LeaveSettingsService(database).setEntitlement(input.value, session.personId));
  });
}

export async function DELETE(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!canManageLeave(session)) return forbidden();
    const input = await readInput(request, entitlementKeySchema);
    if (!input.ok) return input.response;
    return leaveResult(await new LeaveSettingsService(database).deleteEntitlement(input.value.employmentTypeId, input.value.leaveTypeId, session.personId));
  });
}
