import { moneyMembers, moneyResult, withSessionAndDatabase } from '../../money-route';

export async function DELETE(request: Request, context: { params: Promise<{ personId: string }> }): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => moneyResult(await moneyMembers(database).removeMember(session, (await context.params).personId)));
}
