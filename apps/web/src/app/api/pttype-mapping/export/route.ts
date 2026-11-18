import { NextResponse } from 'next/server';
import { canManagePttypeMapping, mappingCsv } from '@backoffice/core';
import { pttypeMappingService } from '../../../../lib/hosxp';
import { forbidden, withSessionAndDatabase } from '../../hr/profile-route';

const MAX_CODES = 2000;

/** ส่งออกข้อมูล of the สิทธิ the page is showing (`?pttype=89,10`), read fresh from HOSxP; audited with the row count. */
export async function GET(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!canManagePttypeMapping(session)) return forbidden();
    const wanted = new Set((new URL(request.url).searchParams.get('pttype') ?? '').split(',').filter(Boolean).slice(0, MAX_CODES));
    const service = pttypeMappingService(database);
    const loaded = await service.load();
    if (!loaded.ok) return NextResponse.json({ error: loaded.code }, { status: 503 });
    const rights = loaded.snapshot.rights.filter((right) => wanted.has(right.code));
    await service.recordExport(session.personId, rights.length);
    return new Response(mappingCsv(rights), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="pttype_mapping.csv"', 'cache-control': 'no-store' } });
  });
}
