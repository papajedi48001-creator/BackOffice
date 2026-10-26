import { cancelRequestInputSchema } from '@backoffice/contracts';
import { readInput, travelResult, travelService, withSessionAndDatabase } from '../../travel-route';

const cancellationInputSchema = cancelRequestInputSchema.pick({ reason: true }).strict();

export async function POST(request: Request, context: { params: Promise<{ travelId: string }> }): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const input = await readInput(request, cancellationInputSchema);
    if (!input.ok) return input.response;
    const { travelId } = await context.params;
    return travelResult(await travelService(database).cancel(session.personId, travelId, input.value.reason));
  });
}
