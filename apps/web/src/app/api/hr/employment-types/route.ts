import { EmploymentTypeService, canManageEmploymentTypes } from '@backoffice/core';
import { employmentTypeInputSchema } from '@backoffice/contracts';
import { forbidden, readInput, resultResponse, withSessionAndDatabase } from '../profile-route';

export async function POST(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!canManageEmploymentTypes(session)) return forbidden();
    const input = await readInput(request, employmentTypeInputSchema);
    if (!input.ok) return input.response;
    return resultResponse(await new EmploymentTypeService(database).create(input.value, session.personId));
  });
}
