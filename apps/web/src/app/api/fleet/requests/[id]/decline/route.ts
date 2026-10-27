import { reasonInputSchema } from '@backoffice/contracts';
import { canManageFleet, fleetDispatch, fleetResult, forbidden, readInput, withSessionAndDatabase } from '../../../fleet-route';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!canManageFleet(session)) return forbidden();
    const input = await readInput(request, reasonInputSchema);
    if (!input.ok) return input.response;
    const { id } = await context.params;
    return fleetResult(await fleetDispatch(database).decline(session.personId, id, input.value.reason));
  });
}
