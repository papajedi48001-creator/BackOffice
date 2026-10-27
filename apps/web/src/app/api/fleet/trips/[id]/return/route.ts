import { odometerInputSchema } from '@backoffice/contracts';
import { canManageFleet, fleetDispatch, fleetResult, readInput, withSessionAndDatabase } from '../../../fleet-route';

/** The trip's driver, or a manager, records the odometer; whether the caller is a manager comes from the session, never the body. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const input = await readInput(request, odometerInputSchema);
    if (!input.ok) return input.response;
    const { id } = await context.params;
    return fleetResult(await fleetDispatch(database).returnTrip(session.personId, id, input.value.odometer, canManageFleet(session)));
  });
}
