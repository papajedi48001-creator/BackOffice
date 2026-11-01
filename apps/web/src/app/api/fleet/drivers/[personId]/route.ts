import { fleetDriverInputSchema } from '@backoffice/contracts';
import { canManageFleet, fleetCatalog, fleetResult, forbidden, readInput, withSessionAndDatabase } from '../../fleet-route';

/** Updates a driver; the person is the one in the path, whatever the body says. */
export async function PUT(request: Request, context: { params: Promise<{ personId: string }> }): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!canManageFleet(session)) return forbidden();
    const { personId } = await context.params;
    const input = await readInput(request, fleetDriverInputSchema, (body) => ({ ...body, personId }));
    if (!input.ok) return input.response;
    return fleetResult(await fleetCatalog(database).upsertDriver(session.personId, input.value));
  });
}

/** Takes a person off the driver list when they never drove a เที่ยวรถ; one with history answers 409 HAS_HISTORY. */
export async function DELETE(request: Request, context: { params: Promise<{ personId: string }> }): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!canManageFleet(session)) return forbidden();
    const { personId } = await context.params;
    return fleetResult(await fleetCatalog(database).deleteDriver(session.personId, personId));
  });
}
