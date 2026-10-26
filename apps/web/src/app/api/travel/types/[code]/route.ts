import { TravelSettingsService, canManageTravel } from '@backoffice/core';
import { travelTypeSettingInputSchema } from '@backoffice/contracts';
import { forbidden, readInput, travelResult, withSessionAndDatabase } from '../../travel-route';

export async function PUT(request: Request, context: { params: Promise<{ code: string }> }): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!canManageTravel(session)) return forbidden();
    const input = await readInput(request, travelTypeSettingInputSchema);
    if (!input.ok) return input.response;
    const { code } = await context.params;
    return travelResult(await new TravelSettingsService(database).setApprovalTarget(session.personId, code, input.value));
  });
}
