import { HrProfileService } from '@backoffice/core';
import { updateEducationInputSchema } from '@backoffice/contracts';
import { readInput, resultResponse, withSessionAndDatabase } from '../../../profile-route';

/** ข้อมูลการศึกษา (ก.พ.7): the whole list. The service lets the person themself and HR save it. */
export async function PUT(request: Request, context: { params: Promise<{ personId: string }> }): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const { personId } = await context.params;
    const input = await readInput(request, updateEducationInputSchema);
    if (!input.ok) return input.response;
    return resultResponse(await new HrProfileService(database).updateEducation(personId, input.value, session));
  });
}
