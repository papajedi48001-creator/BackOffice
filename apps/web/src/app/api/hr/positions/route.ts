import { PositionCatalogService, canManagePositions } from '@backoffice/core';
import { positionInputSchema } from '@backoffice/contracts';
import { forbidden, readInput, resultResponse, withSessionAndDatabase } from '../profile-route';

export async function POST(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!canManagePositions(session)) return forbidden();
    const input = await readInput(request, positionInputSchema);
    if (!input.ok) return input.response;
    return resultResponse(await new PositionCatalogService(database).create(input.value, session.personId));
  });
}
