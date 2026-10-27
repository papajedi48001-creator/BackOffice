import { fleetTripUpdateSchema } from '@backoffice/contracts';
import { canManageFleet, fleetDispatch, fleetResult, forbidden, readInput, withSessionAndDatabase } from '../../fleet-route';

/** Change the car, driver or times of a PLANNED เที่ยวรถ. */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!canManageFleet(session)) return forbidden();
    const input = await readInput(request, fleetTripUpdateSchema);
    if (!input.ok) return input.response;
    const { id } = await context.params;
    return fleetResult(await fleetDispatch(database).updateTrip(session.personId, id, input.value));
  });
}
