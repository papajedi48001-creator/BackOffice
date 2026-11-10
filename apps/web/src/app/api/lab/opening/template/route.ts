import { NextResponse } from 'next/server';
import { itemTemplateCsv, openingTemplateCsv } from '@backoffice/core';
import { withSessionAndDatabase } from '../../lab-route';

/** แม่แบบนำเข้า: `?kind=items` (ทะเบียนวัสดุ) or `?kind=opening` (ยอดยกมา), UTF-8 with a BOM so Excel keeps the Thai. */
export async function GET(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async () => {
    const kind = new URL(request.url).searchParams.get('kind');
    if (kind !== 'items' && kind !== 'opening') return NextResponse.json({ error: 'invalid_input', fields: ['kind'] }, { status: 400 });
    const csv = kind === 'items' ? itemTemplateCsv() : openingTemplateCsv();
    return new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="lab-${kind}-template.csv"`, 'cache-control': 'no-store' } });
  });
}
