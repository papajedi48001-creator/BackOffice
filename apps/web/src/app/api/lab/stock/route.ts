import { NextResponse } from 'next/server';
import { forbidden, labQueries, mayInStore, withSessionAndDatabase } from '../lab-route';

/** ยอดคงเหลือ of one store (`?store=<id>`) or the whole Lab (`?store=ALL`). A เจ้าหน้าที่ reads only their own คลังย่อย. */
export async function GET(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const store = new URL(request.url).searchParams.get('store') ?? '';
    if (!store || !(await mayInStore(database, session, 'viewStock', store))) return forbidden();
    return NextResponse.json({ rows: await labQueries(database).balances(store) }, { headers: { 'cache-control': 'no-store' } });
  });
}
