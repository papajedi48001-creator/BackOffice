import { leaveCancelDaysInputSchema, leaveRequestInputSchema } from '@backoffice/contracts';
import { leaveResult, leaveService, readInput, withoutPersonId, withSessionAndDatabase } from '../leave-route';

/** Edits and resubmits a RETURNED ใบลา of the signed-in person, or a RETURNED ขอยกเลิกวันลา when the body has no ประเภทการลา. */
export async function PUT(request: Request, context: { params: Promise<{ requestId: string }> }): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const { requestId } = await context.params;
    const body: unknown = await request.clone().json().catch(() => null);
    if (body && typeof body === 'object' && !('leaveTypeId' in body)) {
      const input = await readInput(request, leaveCancelDaysInputSchema, withoutPersonId);
      if (!input.ok) return input.response;
      return leaveResult(await leaveService(database).resubmitCancelDays(session.personId, requestId, input.value));
    }
    const input = await readInput(request, leaveRequestInputSchema, withoutPersonId);
    if (!input.ok) return input.response;
    return leaveResult(await leaveService(database).resubmit(session.personId, requestId, input.value));
  });
}
