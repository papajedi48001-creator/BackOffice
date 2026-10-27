import { fleetAssignmentInputSchema } from '@backoffice/contracts';
import { canManageFleet, fleetDispatch, fleetResult, forbidden, readInput, withSessionAndDatabase } from '../../../fleet-route';

type Context = { params: Promise<{ id: string }> };

/** จัดรถ: join a PLANNED เที่ยวรถ or open a new one. */
export async function POST(request: Request, context: Context): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!canManageFleet(session)) return forbidden();
    const input = await readInput(request, fleetAssignmentInputSchema);
    if (!input.ok) return input.response;
    const { id } = await context.params;
    const result = await fleetDispatch(database).assign(session.personId, id, input.value);
    return fleetResult(result, result.ok ? { tripId: result.tripId } : {});
  });
}

/** ย้ายเที่ยวรถ: the same body as POST, for a ใบ that is already assigned. */
export async function PUT(request: Request, context: Context): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!canManageFleet(session)) return forbidden();
    const input = await readInput(request, fleetAssignmentInputSchema);
    if (!input.ok) return input.response;
    const { id } = await context.params;
    const result = await fleetDispatch(database).move(session.personId, id, input.value);
    return fleetResult(result, result.ok ? { tripId: result.tripId } : {});
  });
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!canManageFleet(session)) return forbidden();
    const { id } = await context.params;
    return fleetResult(await fleetDispatch(database).unassign(session.personId, id));
  });
}
