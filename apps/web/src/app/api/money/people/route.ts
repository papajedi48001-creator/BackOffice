import { NextResponse } from 'next/server';
import { AdminQueries, canManageMoney } from '@backoffice/core';
import { forbidden, withSessionAndDatabase } from '../money-route';

/** Active บุคลากร by name or employee code, for the member picker; ผู้ดูแล Smart Money only. */
export async function GET(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!canManageMoney(session)) return forbidden();
    const text = (new URL(request.url).searchParams.get('q') ?? '').trim().slice(0, 100);
    return NextResponse.json({ people: text ? await new AdminQueries(database).people(text) : [] }, { headers: { 'cache-control': 'no-store' } });
  });
}
