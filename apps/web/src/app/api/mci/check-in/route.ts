import { mciCheckInInputSchema } from '@backoffice/contracts';
import { mciResponders, mciResult, readInput, withSessionAndDatabase } from '../mci-route';

/** รายงานตัว as the signed-in person; any active บุคลากร may. */
export async function POST(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const input = await readInput(request, mciCheckInInputSchema);
    if (!input.ok) return input.response;
    return mciResult(await mciResponders(database).checkIn(session, input.value));
  });
}
