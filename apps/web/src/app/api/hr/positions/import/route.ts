import { NextResponse } from 'next/server';
import { PositionCatalogService, canManagePositions } from '@backoffice/core';
import { importPositionsInputSchema } from '@backoffice/contracts';
import { forbidden, readInput, withSessionAndDatabase } from '../../profile-route';

export async function POST(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!canManagePositions(session)) return forbidden();
    const input = await readInput(request, importPositionsInputSchema);
    if (!input.ok) return input.response;
    const result = await new PositionCatalogService(database).importCsv(input.value.csv, session.personId);
    return result.ok ? NextResponse.json(result) : NextResponse.json({ errors: result.errors }, { status: 422 });
  });
}
