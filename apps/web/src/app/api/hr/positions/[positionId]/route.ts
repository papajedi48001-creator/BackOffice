import { PositionCatalogService, canManagePositions } from '@backoffice/core';
import { positionInputSchema } from '@backoffice/contracts';
import { forbidden, readInput, resultResponse, withSessionAndDatabase } from '../../profile-route';

export async function PUT(request: Request, context: { params: Promise<{ positionId: string }> }): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!canManagePositions(session)) return forbidden();
    const { positionId } = await context.params;
    const input = await readInput(request, positionInputSchema);
    if (!input.ok) return input.response;
    return resultResponse(await new PositionCatalogService(database).update(positionId, input.value, session.personId));
  });
}

export async function DELETE(request: Request, context: { params: Promise<{ positionId: string }> }): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!canManagePositions(session)) return forbidden();
    const { positionId } = await context.params;
    return resultResponse(await new PositionCatalogService(database).delete(positionId, session.personId));
  });
}
