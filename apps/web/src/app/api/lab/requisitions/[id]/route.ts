import { labRequisitionInputSchema } from '@backoffice/contracts';
import { labRequisitions, labResult, readInput, withSessionAndDatabase } from '../../lab-route';

/** ส่งใบขอเบิกที่ถูกตีกลับอีกครั้ง. */
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const input = await readInput(request, labRequisitionInputSchema);
    if (!input.ok) return input.response;
    return labResult(await labRequisitions(database).resubmit(session, (await context.params).id, input.value));
  });
}
