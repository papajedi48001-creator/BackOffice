import { HrProfileService } from '@backoffice/core';
import { updatePersonProfileInputSchema } from '@backoffice/contracts';
import { readInput, resultResponse, withSessionAndDatabase } from '../../../profile-route';

export async function PUT(request: Request, context: { params: Promise<{ personId: string }> }): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const { personId } = await context.params;
    const input = await readInput(request, updatePersonProfileInputSchema);
    if (!input.ok) return input.response;
    return resultResponse(await new HrProfileService(database).updateProfile(personId, input.value, session));
  });
}
