import { NextResponse } from 'next/server';
import { OfficialTravelQueries } from '@backoffice/core';
import { officialTravelInputSchema } from '@backoffice/contracts';
import { readInput, travelResult, travelService, withoutLeader, withSessionAndDatabase } from '../travel-route';

/** The trip, when the viewer is on it, decides it, or is HR; otherwise not found. */
export async function GET(request: Request, context: { params: Promise<{ travelId: string }> }): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const { travelId } = await context.params;
    const detail = await new OfficialTravelQueries(database).detail(travelId, session);
    return detail ? NextResponse.json(detail) : NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  });
}

/** The หัวหน้าคณะ edits a returned trip and sends it up again. */
export async function PUT(request: Request, context: { params: Promise<{ travelId: string }> }): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const input = await readInput(request, officialTravelInputSchema, withoutLeader);
    if (!input.ok) return input.response;
    const { travelId } = await context.params;
    return travelResult(await travelService(database).resubmit(session.personId, travelId, input.value));
  });
}
