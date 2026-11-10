import { NextResponse } from 'next/server';
import { exportIncident } from '@backoffice/core';
import { canCommandMci, forbidden, mciResult, withSessionAndDatabase } from '../../../mci-route';

/** CSV of a closed เหตุ: `?kind=patients` or `?kind=responders`. The file name holds the เหตุ id only. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!canCommandMci(session)) return forbidden();
    const kind = new URL(request.url).searchParams.get('kind');
    if (kind !== 'patients' && kind !== 'responders') return NextResponse.json({ error: 'invalid_input', fields: ['kind'] }, { status: 400 });
    const { id } = await context.params;
    const result = await exportIncident(database, session.personId, id, kind);
    if (!result.ok) return mciResult(result);
    const safeId = id.replace(/[^A-Za-z0-9-]/g, '');
    return new Response(result.csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="mci-${safeId}-${kind}.csv"`, 'cache-control': 'no-store' } });
  });
}
