import { leaveRequestInputSchema } from '@backoffice/contracts';
import { leaveResult, leaveService, readInput, withoutPersonId, withSessionAndDatabase } from './leave-route';

export async function POST(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const input = await readInput(request, leaveRequestInputSchema, withoutPersonId);
    if (!input.ok) return input.response;
    return leaveResult(await leaveService(database).submit(session.personId, input.value), 201);
  });
}
