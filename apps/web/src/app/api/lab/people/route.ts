import { NextResponse } from 'next/server';
import { AdminQueries } from '@backoffice/core';
import { forbidden, may, withSessionAndDatabase } from '../lab-route';

/** Active บุคลากร by name or employee code, for the สมาชิก picker; ผู้จัดการวัสดุคงคลัง Lab (or ผู้ดูแลระบบ) only. */
export async function GET(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!(await may(database, session, 'manageMembers'))) return forbidden();
    const text = (new URL(request.url).searchParams.get('q') ?? '').trim().slice(0, 100);
    return NextResponse.json({ people: text ? await new AdminQueries(database).people(text) : [] }, { headers: { 'cache-control': 'no-store' } });
  });
}
