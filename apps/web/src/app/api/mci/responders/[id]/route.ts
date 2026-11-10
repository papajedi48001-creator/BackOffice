import { mciResponderUpdateInputSchema } from '@backoffice/contracts';
import { mciResponders, mciResult, readInput, withSessionAndDatabase } from '../../mci-route';

/** ย้ายจุด / เปลี่ยนบทบาทสั่งการ; the service decides from the caller's own check-in. */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const input = await readInput(request, mciResponderUpdateInputSchema);
    if (!input.ok) return input.response;
    const { id } = await context.params;
    return mciResult(await mciResponders(database).update(session, id, input.value));
  });
}
