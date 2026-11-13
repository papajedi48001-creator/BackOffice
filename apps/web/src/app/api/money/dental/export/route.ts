import { NextResponse } from 'next/server';
import { canManageMoney, dentalCsv, dentalRange, loadMoneyMember, moneyCan, recordDentalExport } from '@backoffice/core';
import { bangkokToday } from '../../../../../lib/bangkok-time';
import { dentalService } from '../../../../../lib/hosxp';
import { forbidden, withSessionAndDatabase } from '../../money-route';

/** ดาวน์โหลด CSV ลูกหนี้ทันตกรรม: anyone who may open the page; every download is audited with its range and row count. */
export async function GET(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!session.personId || !moneyCan(await loadMoneyMember(database, session.personId), canManageMoney(session), 'dental')) return forbidden();
    const query = new URL(request.url).searchParams;
    const range = dentalRange({ start: query.get('start') ?? '', end: query.get('end') ?? '' }, bangkokToday());
    if (!range.ok) return NextResponse.json({ error: range.code }, { status: 400 });
    const loaded = await dentalService(database).load(range.start, range.end);
    if (!loaded.ok) return NextResponse.json({ error: loaded.code }, { status: 503 });
    await recordDentalExport(database, session.personId, { start: range.start, end: range.end, rows: loaded.rows.length });
    return new Response(dentalCsv(loaded.rows), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="dental_claims_${range.start}_${range.end}.csv"`, 'cache-control': 'no-store' } });
  });
}
