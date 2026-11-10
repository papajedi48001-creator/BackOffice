import { labDecisionInputSchema } from '@backoffice/contracts';
import { labRequisitions, labResult, readInput, withSessionAndDatabase } from '../../../lab-route';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const input = await readInput(request, labDecisionInputSchema);
    if (!input.ok) return input.response;
    return labResult(await labRequisitions(database).decide(session, (await context.params).id, input.value));
  });
}
