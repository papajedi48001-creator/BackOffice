import { labRequisitionInputSchema } from '@backoffice/contracts';
import { labRequisitions, labResult, readInput, withSessionAndDatabase } from '../lab-route';

export async function POST(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const input = await readInput(request, labRequisitionInputSchema);
    if (!input.ok) return input.response;
    return labResult(await labRequisitions(database).create(session, input.value), 201);
  });
}
