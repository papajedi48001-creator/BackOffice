import { NextResponse } from 'next/server';
import { leaveRequestInputSchema } from '@backoffice/contracts';
import { leaveService, readInput, withoutPersonId, withSessionAndDatabase } from '../leave-route';

export async function POST(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const input = await readInput(request, leaveRequestInputSchema, withoutPersonId);
    if (!input.ok) return input.response;
    return NextResponse.json(await leaveService(database).preview(session.personId, input.value));
  });
}
