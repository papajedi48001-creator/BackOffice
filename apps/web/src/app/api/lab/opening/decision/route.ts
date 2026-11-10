import { labOpeningDecisionInputSchema } from '@backoffice/contracts';
import { labOpening, labResult, readInput, withSessionAndDatabase } from '../../lab-route';

/** หัวหน้า Lab รับรอง or ตีกลับ the ยอดยกมา. */
export async function POST(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const input = await readInput(request, labOpeningDecisionInputSchema);
    if (!input.ok) return input.response;
    return labResult(await labOpening(database).decide(session, input.value));
  });
}
