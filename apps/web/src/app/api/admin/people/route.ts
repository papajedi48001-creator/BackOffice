import { NextResponse } from 'next/server';
import { adminQueries, withAdmin } from '../admin-route';

/** Active บุคลากร by name or employee code, for the grant picker. */
export async function GET(request: Request): Promise<Response> {
  return withAdmin(request, async (_session, database) => {
    const text = (new URL(request.url).searchParams.get('q') ?? '').trim().slice(0, 100);
    return NextResponse.json({ people: text ? await adminQueries(database).people(text) : [] });
  });
}
