import { leaveCancelDaysInputSchema } from '@backoffice/contracts';
import { leaveResult, leaveService, readInput, withSessionAndDatabase } from '../../leave-route';

export async function POST(request: Request, context: { params: Promise<{ requestId: string }> }): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const input = await readInput(request, leaveCancelDaysInputSchema);
    if (!input.ok) return input.response;
    const { requestId } = await context.params;
    return leaveResult(await leaveService(database).requestCancelDays(session.personId, requestId, input.value), 201);
  });
}
