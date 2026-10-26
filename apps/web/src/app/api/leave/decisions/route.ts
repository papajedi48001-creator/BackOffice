import { NextResponse } from 'next/server';
import { leaveBulkApproveInputSchema } from '@backoffice/contracts';
import { leaveService, readInput, withSessionAndDatabase } from '../leave-route';

/** Approves many ใบลา at once; each one is checked and committed on its own. Decisions with a reason use /api/requests/[id]/decisions. */
export async function POST(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const input = await readInput(request, leaveBulkApproveInputSchema);
    if (!input.ok) return input.response;
    return NextResponse.json({ results: await leaveService(database).approveMany(session.personId, input.value.requestIds) });
  });
}
