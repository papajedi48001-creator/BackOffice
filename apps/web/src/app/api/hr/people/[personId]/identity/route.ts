import { PersonAccountService } from '@backoffice/core';
import { updatePersonIdentityInputSchema } from '@backoffice/contracts';
import { readInput, resultResponse, withNationalIdKey } from '../../../profile-route';

/** Employee code, employment status and national ID. A username is refused here: it never changes. */
export async function PUT(request: Request, context: { params: Promise<{ personId: string }> }): Promise<Response> {
  return withNationalIdKey(request, async (session, database, protector) => {
    const { personId } = await context.params;
    const input = await readInput(request, updatePersonIdentityInputSchema);
    if (!input.ok) return input.response;
    return resultResponse(await new PersonAccountService(database, protector).updateIdentity(personId, input.value, session));
  });
}
