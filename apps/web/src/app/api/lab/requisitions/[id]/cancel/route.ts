import { labRequisitions, labResult, withSessionAndDatabase } from '../../../lab-route';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => labResult(await labRequisitions(database).cancel(session, (await context.params).id)));
}
