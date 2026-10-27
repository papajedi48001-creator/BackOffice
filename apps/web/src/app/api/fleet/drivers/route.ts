import { fleetDriverInputSchema } from '@backoffice/contracts';
import { canManageFleet, fleetCatalog, fleetResult, forbidden, readInput, withSessionAndDatabase } from '../fleet-route';

/** Adds a person to the driver list (or updates them). */
export async function POST(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!canManageFleet(session)) return forbidden();
    const input = await readInput(request, fleetDriverInputSchema);
    if (!input.ok) return input.response;
    return fleetResult(await fleetCatalog(database).upsertDriver(session.personId, input.value), {}, 201);
  });
}
