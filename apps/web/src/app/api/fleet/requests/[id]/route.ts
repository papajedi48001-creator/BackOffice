import { NextResponse } from 'next/server';
import { fleetRequestInputSchema } from '@backoffice/contracts';
import { fleetQueries, fleetRequests, fleetResult, readInput, settle, withSessionAndDatabase } from '../../fleet-route';

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const { id } = await context.params;
    const detail = await fleetQueries(database).detail(id, session);
    return detail ? NextResponse.json(detail) : NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  });
}

/** The requester edits a returned ใบ and sends it up again. */
export async function PUT(request: Request, context: Context): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const input = await readInput(request, fleetRequestInputSchema);
    if (!input.ok) return input.response;
    const { id } = await context.params;
    return fleetResult(await settle(() => fleetRequests(database).resubmit(session.personId, id, input.value)));
  });
}
