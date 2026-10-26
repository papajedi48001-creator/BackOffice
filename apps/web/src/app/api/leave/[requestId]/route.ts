import { leaveRequestInputSchema } from '@backoffice/contracts';
import { leaveResult, leaveService, readInput, withoutPersonId, withSessionAndDatabase } from '../leave-route';

/** Edits and resubmits a RETURNED ใบลา of the signed-in person. */
export async function PUT(request: Request, context: { params: Promise<{ requestId: string }> }): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const input = await readInput(request, leaveRequestInputSchema, withoutPersonId);
    if (!input.ok) return input.response;
    const { requestId } = await context.params;
    return leaveResult(await leaveService(database).resubmit(session.personId, requestId, input.value));
  });
}
