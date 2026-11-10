import { labMemberInputSchema } from '@backoffice/contracts';
import { labResult, labSettings, readInput, withSessionAndDatabase } from '../lab-route';

/** Adds or changes one สมาชิก; ผู้จัดการวัสดุคงคลัง Lab only (checked by the service). */
export async function PUT(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const input = await readInput(request, labMemberInputSchema);
    if (!input.ok) return input.response;
    return labResult(await labSettings(database).saveMember(session, input.value));
  });
}
