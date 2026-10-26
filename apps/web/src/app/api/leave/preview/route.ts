import { NextResponse } from 'next/server';
import { leaveRequestInputSchema } from '@backoffice/contracts';
import { leaveService, readInput, withoutPersonId, withSessionAndDatabase } from '../leave-route';

// The preview stores nothing, so the form may ask before the reason is typed.
const withPreviewReason = (body: Record<string, unknown>) => ({ ...withoutPersonId(body), reason: typeof body.reason === 'string' && body.reason.trim() ? body.reason : '-' });

export async function POST(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const input = await readInput(request, leaveRequestInputSchema, withPreviewReason);
    if (!input.ok) return input.response;
    return NextResponse.json(await leaveService(database).preview(session.personId, input.value));
  });
}
