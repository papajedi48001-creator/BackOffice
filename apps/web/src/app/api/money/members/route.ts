import { moneyMemberInputSchema } from '@backoffice/contracts';
import { moneyMembers, moneyResult, readInput, withSessionAndDatabase } from '../money-route';

/** Adds or changes one เจ้าหน้าที่ Smart Money; ผู้ดูแล Smart Money only (checked by the service). */
export async function PUT(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const input = await readInput(request, moneyMemberInputSchema);
    if (!input.ok) return input.response;
    return moneyResult(await moneyMembers(database).saveMember(session, input.value));
  });
}
