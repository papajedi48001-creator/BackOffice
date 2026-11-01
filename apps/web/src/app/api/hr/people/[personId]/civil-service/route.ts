import { HrProfileService } from '@backoffice/core';
import { updateCivilServiceInputSchema } from '@backoffice/contracts';
import { readInput, resultResponse, withSessionAndDatabase } from '../../../profile-route';

/** ข้อมูลการปฏิบัติราชการ (ก.พ.7). The service lets only HR save it. */
export async function PUT(request: Request, context: { params: Promise<{ personId: string }> }): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const { personId } = await context.params;
    const input = await readInput(request, updateCivilServiceInputSchema);
    if (!input.ok) return input.response;
    return resultResponse(await new HrProfileService(database).updateCivilService(personId, input.value, session));
  });
}
