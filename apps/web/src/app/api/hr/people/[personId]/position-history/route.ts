import { HrProfileService } from '@backoffice/core';
import { updatePositionHistoryInputSchema } from '@backoffice/contracts';
import { readInput, resultResponse, withSessionAndDatabase } from '../../../profile-route';

/** ตำแหน่งและอัตราเงินเดือน (ก.พ.7): the whole list. The service lets only HR save it. */
export async function PUT(request: Request, context: { params: Promise<{ personId: string }> }): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const { personId } = await context.params;
    const input = await readInput(request, updatePositionHistoryInputSchema);
    if (!input.ok) return input.response;
    return resultResponse(await new HrProfileService(database).updatePositionHistory(personId, input.value, session));
  });
}
