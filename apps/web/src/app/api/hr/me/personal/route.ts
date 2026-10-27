import { HrProfileService } from '@backoffice/core';
import { updateOwnPersonalInputSchema } from '@backoffice/contracts';
import { readInput, resultResponse, withSessionAndDatabase } from '../../profile-route';

/** The signed-in person's own ข้อมูลส่วนตัว. The person comes from the session only; any id in the body is dropped, and work fields are refused. */
export async function PUT(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const input = await readInput(request, updateOwnPersonalInputSchema, (body) => Object.fromEntries(Object.entries(body).filter(([key]) => key !== 'personId')));
    if (!input.ok) return input.response;
    return resultResponse(await new HrProfileService(database).updateOwnPersonal(session.personId, input.value, session));
  });
}
