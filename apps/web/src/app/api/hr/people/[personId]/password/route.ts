import { PersonAccountService } from '@backoffice/core';
import { setPasswordInputSchema } from '@backoffice/contracts';
import { readInput, resultResponse, withNationalIdKey } from '../../../profile-route';

export async function PUT(request: Request, context: { params: Promise<{ personId: string }> }): Promise<Response> {
  return withNationalIdKey(request, async (session, database, protector) => {
    const { personId } = await context.params;
    const input = await readInput(request, setPasswordInputSchema);
    if (!input.ok) return input.response;
    return resultResponse(await new PersonAccountService(database, protector).setPassword(personId, input.value.password, session));
  });
}
