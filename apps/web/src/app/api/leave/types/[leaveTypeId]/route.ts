import { LeaveSettingsService, canManageLeave } from '@backoffice/core';
import { leaveTypeInputSchema } from '@backoffice/contracts';
import { forbidden, leaveResult, readInput, withSessionAndDatabase } from '../../leave-route';

export async function PUT(request: Request, context: { params: Promise<{ leaveTypeId: string }> }): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!canManageLeave(session)) return forbidden();
    const input = await readInput(request, leaveTypeInputSchema);
    if (!input.ok) return input.response;
    const { leaveTypeId } = await context.params;
    return leaveResult(await new LeaveSettingsService(database).updateType(leaveTypeId, input.value, session.personId));
  });
}
