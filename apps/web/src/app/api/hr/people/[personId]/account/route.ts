import { PersonAccountService } from '@backoffice/core';
import { localAccountInputSchema } from '@backoffice/contracts';
import { readInput, resultResponse, withNationalIdKey } from '../../../profile-route';

/** Adds a บัญชีท้องถิ่น to a person who has none yet, such as one brought in by the master-data import. */
export async function POST(request: Request, context: { params: Promise<{ personId: string }> }): Promise<Response> {
  return withNationalIdKey(request, async (session, database, protector) => {
    const { personId } = await context.params;
    const input = await readInput(request, localAccountInputSchema);
    if (!input.ok) return input.response;
    return resultResponse(await new PersonAccountService(database, protector).createAccount(personId, input.value, session), 201);
  });
}
