import { fleetRequestInputSchema } from '@backoffice/contracts';
import { fleetRequests, fleetResult, readInput, withSessionAndDatabase } from '../fleet-route';

/** The requester is the session's person; a person named in the body is rejected by the strict schema. */
export async function POST(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const input = await readInput(request, fleetRequestInputSchema);
    if (!input.ok) return input.response;
    const result = await fleetRequests(database).submit(session.personId, input.value);
    return fleetResult(result, result.ok ? { fleetRequestId: result.fleetRequestId } : {}, 201);
  });
}
