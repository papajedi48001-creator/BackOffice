import { labUsageInputSchema } from '@backoffice/contracts';
import { labResult, labUsages, readInput, withSessionAndDatabase } from '../lab-route';

/** ตัดใช้: the service checks the member's งาน against the store. */
export async function POST(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const input = await readInput(request, labUsageInputSchema);
    if (!input.ok) return input.response;
    return labResult(await labUsages(database).record(session, input.value), 201);
  });
}
