import { NextResponse } from 'next/server';
import { MciQueries } from '@backoffice/core';
import { getSharedDatabase } from '../../../../lib/database';

/** กระดานสาธารณะ: no sign-in. Only the public projection leaves the server (see buildPublicBoard). */
export async function GET(): Promise<Response> {
  const database = getSharedDatabase();
  if (!database) return NextResponse.json({ error: 'service_unavailable' }, { status: 503, headers: { 'cache-control': 'no-store' } });
  return NextResponse.json(await new MciQueries(database).publicBoard(), { headers: { 'cache-control': 'no-store' } });
}

export const dynamic = 'force-dynamic';
