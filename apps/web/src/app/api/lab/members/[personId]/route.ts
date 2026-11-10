import { labResult, labSettings, withSessionAndDatabase } from '../../lab-route';

export async function DELETE(request: Request, context: { params: Promise<{ personId: string }> }): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => labResult(await labSettings(database).removeMember(session, (await context.params).personId)));
}
