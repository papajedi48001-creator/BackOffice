import { NextResponse } from 'next/server';
import { nhsoUploadSchema } from '@backoffice/contracts';
import { NhsoDatasetService } from '@backoffice/core';
import { moneyResult, withSessionAndDatabase } from '../../money-route';

/** A report of 20,000 rows × 80 short cells fits well under this; anything larger is refused before it is parsed. */
const MAX_BODY = 16 * 1024 * 1024;
const tooLarge = () => NextResponse.json({ error: 'TOO_LARGE', message: 'ไฟล์ใหญ่เกินไป' }, { status: 413 });

/** ข้อมูลในระบบ: summaries for the files page, or every dataset with its rows (`?rows=1`) for the dashboard. */
export async function GET(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const service = new NhsoDatasetService(database);
    const result = new URL(request.url).searchParams.get('rows') === '1' ? await service.all(session) : await service.list(session);
    if (!result.ok) return moneyResult(result);
    return NextResponse.json({ datasets: result.datasets }, { headers: { 'cache-control': 'no-store' } });
  });
}

/** นำเข้าไฟล์: one report as the browser read it; ผู้ดูแล Smart Money only (checked by the service). */
export async function POST(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY) return tooLarge();
    const text = await request.text();
    if (text.length > MAX_BODY) return tooLarge();
    let body: unknown;
    try { body = JSON.parse(text); } catch { body = null; }
    const parsed = nhsoUploadSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'invalid_input', fields: [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? '')))].filter(Boolean) }, { status: 400 });
    const result = await new NhsoDatasetService(database).upload(session, parsed.data);
    if (!result.ok && result.code === 'INVALID_REPORT') return NextResponse.json({ error: result.code, message: result.message }, { status: 400 });
    return moneyResult(result);
  });
}

/** ลบข้อมูลทั้งหมด: ผู้ดูแล Smart Money only. */
export async function DELETE(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => moneyResult(await new NhsoDatasetService(database).removeAll(session)));
}
