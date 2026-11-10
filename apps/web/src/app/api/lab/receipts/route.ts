import { labReceiptInputSchema } from '@backoffice/contracts';
import { labReceipts, labResult, readInput, withSessionAndDatabase } from '../lab-route';

export async function POST(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const input = await readInput(request, labReceiptInputSchema);
    if (!input.ok) return input.response;
    return labResult(await labReceipts(database).create(session, input.value), 201);
  });
}
