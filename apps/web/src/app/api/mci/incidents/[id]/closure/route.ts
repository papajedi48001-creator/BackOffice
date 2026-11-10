import { canCommandMci, forbidden, mciIncidents, mciResult, withSessionAndDatabase } from '../../../mci-route';

/** ปิดเหตุ: checks everyone out and tells them. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!canCommandMci(session)) return forbidden();
    const { id } = await context.params;
    return mciResult(await mciIncidents(database).close(session.personId, id));
  });
}
