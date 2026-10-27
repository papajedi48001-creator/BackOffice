import { NextResponse } from 'next/server';
import { canManageFleet, fleetQueries, forbidden, withSessionAndDatabase } from '../fleet-route';

const parse = (value: string | null) => {
  const time = value && /^\d{4}-\d{2}-\d{2}T/.test(value) ? Date.parse(value) : Number.NaN;
  return Number.isNaN(time) ? null : new Date(time);
};

/** Free cars and drivers for the จัดรถ dialog. */
export async function GET(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!canManageFleet(session)) return forbidden();
    const params = new URL(request.url).searchParams;
    const from = parse(params.get('from'));
    const to = parse(params.get('to'));
    if (!from || !to || from >= to) return NextResponse.json({ error: 'invalid_input', fields: ['from', 'to'] }, { status: 400 });
    return NextResponse.json(await fleetQueries(database).availability(from, to));
  });
}
