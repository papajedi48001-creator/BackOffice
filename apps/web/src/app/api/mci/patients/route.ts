import { mciNewPatientInputSchema } from '@backoffice/contracts';
import { mciPatients, mciResult, readInput, withSessionAndDatabase } from '../mci-route';

/** บันทึกผู้ป่วยใหม่: answers the new เลขป้าย. */
export async function POST(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const input = await readInput(request, mciNewPatientInputSchema);
    if (!input.ok) return input.response;
    return mciResult(await mciPatients(database).create(session, input.value), 201);
  });
}
