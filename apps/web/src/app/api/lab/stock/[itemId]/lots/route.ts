import { NextResponse } from 'next/server';
import { forbidden, labQueries, mayInStore, withSessionAndDatabase } from '../../../lab-route';

/** The lots of one item in one store, for the ตัดใช้ lot picker. */
export async function GET(request: Request, context: { params: Promise<{ itemId: string }> }): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const store = new URL(request.url).searchParams.get('store') ?? '';
    if (!store || store === 'ALL' || !(await mayInStore(database, session, 'viewStock', store))) return forbidden();
    return NextResponse.json({ lots: await labQueries(database).lots((await context.params).itemId, store) }, { headers: { 'cache-control': 'no-store' } });
  });
}
