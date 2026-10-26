import { officialTravelInputSchema } from '@backoffice/contracts';
import { readInput, travelResult, travelService, withoutLeader, withSessionAndDatabase } from './travel-route';

export async function POST(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const input = await readInput(request, officialTravelInputSchema, withoutLeader);
    if (!input.ok) return input.response;
    return travelResult(await travelService(database).submit(session.personId, input.value), 201);
  });
}
