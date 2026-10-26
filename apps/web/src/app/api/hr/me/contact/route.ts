import { HrProfileService } from '@backoffice/core';
import { updatePersonContactInputSchema } from '@backoffice/contracts';
import { readInput, resultResponse, withSessionAndDatabase } from '../../profile-route';

/** The signed-in person's own contact details. The person comes from the session only; any id in the body is dropped. */
export async function PUT(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const input = await readInput(request, updatePersonContactInputSchema, (body) => Object.fromEntries(Object.entries(body).filter(([key]) => key !== 'personId')));
    if (!input.ok) return input.response;
    return resultResponse(await new HrProfileService(database).updateContact(session.personId, input.value, session));
  });
}
