import { NextResponse } from 'next/server';
import { canManageFleet, forbidden, staffSearch, withSessionAndDatabase } from '../fleet-route';

/** Names and units for adding a driver; managers only. */
export async function GET(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!canManageFleet(session)) return forbidden();
    const text = (new URL(request.url).searchParams.get('q') ?? '').slice(0, 100);
    return NextResponse.json({ people: await staffSearch(database, text) });
  });
}
