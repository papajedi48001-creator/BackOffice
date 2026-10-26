import { EmploymentTypeService, canManageEmploymentTypes } from '@backoffice/core';
import { employmentTypeInputSchema } from '@backoffice/contracts';
import { forbidden, readInput, resultResponse, withSessionAndDatabase } from '../../profile-route';

export async function PUT(request: Request, context: { params: Promise<{ employmentTypeId: string }> }): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!canManageEmploymentTypes(session)) return forbidden();
    const { employmentTypeId } = await context.params;
    const input = await readInput(request, employmentTypeInputSchema);
    if (!input.ok) return input.response;
    return resultResponse(await new EmploymentTypeService(database).update(employmentTypeId, input.value, session.personId));
  });
}
