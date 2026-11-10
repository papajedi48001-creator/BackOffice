import { mciResponders, mciResult, withSessionAndDatabase } from '../../../mci-route';

/** ออกจากเวร: oneself, or someone else as ผู้บัญชาการ / หัวหน้าจุด of their zone. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const { id } = await context.params;
    return mciResult(await mciResponders(database).checkOut(session, id));
  });
}
