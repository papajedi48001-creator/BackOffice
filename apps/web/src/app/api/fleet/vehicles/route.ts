import { fleetVehicleInputSchema } from '@backoffice/contracts';
import { canManageFleet, fleetCatalog, fleetResult, forbidden, readInput, withSessionAndDatabase } from '../fleet-route';

export async function POST(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!canManageFleet(session)) return forbidden();
    const input = await readInput(request, fleetVehicleInputSchema);
    if (!input.ok) return input.response;
    const result = await fleetCatalog(database).createVehicle(session.personId, input.value);
    return fleetResult(result, result.ok ? { vehicleId: result.vehicleId } : {}, 201);
  });
}
