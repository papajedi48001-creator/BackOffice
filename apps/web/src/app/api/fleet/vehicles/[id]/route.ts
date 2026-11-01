import { fleetVehicleInputSchema } from '@backoffice/contracts';
import { canManageFleet, fleetCatalog, fleetResult, forbidden, readInput, withSessionAndDatabase } from '../../fleet-route';

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!canManageFleet(session)) return forbidden();
    const input = await readInput(request, fleetVehicleInputSchema);
    if (!input.ok) return input.response;
    const { id } = await context.params;
    return fleetResult(await fleetCatalog(database).updateVehicle(session.personId, id, input.value));
  });
}

/** Removes a car never put on a เที่ยวรถ; one with history answers 409 HAS_HISTORY. */
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!canManageFleet(session)) return forbidden();
    const { id } = await context.params;
    return fleetResult(await fleetCatalog(database).deleteVehicle(session.personId, id));
  });
}
