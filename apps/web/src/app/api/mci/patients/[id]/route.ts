import { mciPatientInputSchema } from '@backoffice/contracts';
import { mciPatients, mciResult, readInput, withSessionAndDatabase } from '../../mci-route';

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const input = await readInput(request, mciPatientInputSchema);
    if (!input.ok) return input.response;
    const { id } = await context.params;
    return mciResult(await mciPatients(database).update(session, id, input.value));
  });
}
