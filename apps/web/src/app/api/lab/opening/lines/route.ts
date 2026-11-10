import { labOpeningLineInputSchema } from '@backoffice/contracts';
import { labOpening, labResult, readInput, withSessionAndDatabase } from '../../lab-route';

export async function POST(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const input = await readInput(request, labOpeningLineInputSchema);
    if (!input.ok) return input.response;
    return labResult(await labOpening(database).saveLine(session, null, input.value), 201);
  });
}
