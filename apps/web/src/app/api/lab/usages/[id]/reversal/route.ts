import { labReasonInputSchema } from '@backoffice/contracts';
import { labResult, labUsages, readInput, withSessionAndDatabase } from '../../../lab-route';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const input = await readInput(request, labReasonInputSchema);
    if (!input.ok) return input.response;
    return labResult(await labUsages(database).reverse(session, (await context.params).id, input.value));
  });
}
