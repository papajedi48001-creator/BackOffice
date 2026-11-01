import { PersonAccountService } from '@backoffice/core';
import { createPersonWithAccountInputSchema } from '@backoffice/contracts';
import { readInput, resultResponse, withNationalIdKey } from '../profile-route';

/** HR adds a new บุคลากร with their บัญชีท้องถิ่น. The service checks the actor may manage people. */
export async function POST(request: Request): Promise<Response> {
  return withNationalIdKey(request, async (session, database, protector) => {
    const input = await readInput(request, createPersonWithAccountInputSchema);
    if (!input.ok) return input.response;
    return resultResponse(await new PersonAccountService(database, protector).create(input.value, session), 201);
  });
}
