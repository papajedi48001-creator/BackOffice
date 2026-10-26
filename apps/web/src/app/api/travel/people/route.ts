import { NextResponse } from 'next/server';
import { OfficialTravelQueries } from '@backoffice/core';
import { withSessionAndDatabase } from '../travel-route';

/** Names and units for adding ผู้ร่วมเดินทาง; any signed-in person may search, and nothing private comes back. */
export async function GET(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (_session, database) => {
    const text = (new URL(request.url).searchParams.get('q') ?? '').slice(0, 100);
    return NextResponse.json({ people: await new OfficialTravelQueries(database).people(text) });
  });
}
