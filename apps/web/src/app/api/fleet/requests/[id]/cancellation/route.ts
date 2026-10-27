import { reasonInputSchema } from '@backoffice/contracts';
import { fleetRequests, fleetResult, readInput, settle, withSessionAndDatabase } from '../../../fleet-route';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const input = await readInput(request, reasonInputSchema);
    if (!input.ok) return input.response;
    const { id } = await context.params;
    return fleetResult(await settle(() => fleetRequests(database).cancel(session.personId, id, input.value.reason)));
  });
}
