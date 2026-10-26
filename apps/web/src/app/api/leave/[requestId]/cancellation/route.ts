import { cancelRequestInputSchema } from '@backoffice/contracts';
import { leaveResult, leaveService, readInput, withSessionAndDatabase } from '../../leave-route';

const cancellationInputSchema = cancelRequestInputSchema.pick({ reason: true }).strict();

export async function POST(request: Request, context: { params: Promise<{ requestId: string }> }): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const input = await readInput(request, cancellationInputSchema);
    if (!input.ok) return input.response;
    const { requestId } = await context.params;
    return leaveResult(await leaveService(database).cancelPending(session.personId, requestId, input.value.reason));
  });
}
