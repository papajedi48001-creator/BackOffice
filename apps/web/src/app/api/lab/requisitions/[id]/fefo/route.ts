import { NextResponse } from 'next/server';
import { labToday } from '@backoffice/core';
import { forbidden, labQueries, may, withSessionAndDatabase } from '../../../lab-route';

/** The issue dialog's FEFO suggestion over คลังหลัก; ผู้ดูแลคลัง Lab only. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!(await may(database, session, 'issue'))) return forbidden();
    return NextResponse.json({ lines: await labQueries(database).fefoSuggestion((await context.params).id, labToday()) }, { headers: { 'cache-control': 'no-store' } });
  });
}
