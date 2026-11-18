import { NextResponse } from 'next/server';
import { dpRemoveSchema, dpUploadSchema } from '@backoffice/contracts';
import { canManageMoney, DpRecordService } from '@backoffice/core';
import { getNationalIdProtector } from '../../../../../lib/national-id';
import { forbidden, moneyResult, readCapped, withSessionAndDatabase } from '../../money-route';

/** One part of 1,500 rows × 80 cells fits well under this; anything larger is refused while it is being read. */
const MAX_BODY = 2 * 1024 * 1024;
const tooLarge = () => NextResponse.json({ error: 'TOO_LARGE', message: 'ข้อมูลใหญ่เกินไป' }, { status: 413 });
const service = (database: Parameters<Parameters<typeof withSessionAndDatabase>[1]>[1]) => new DpRecordService(database, getNationalIdProtector());
const failed = (result: { ok: false; code: string; message?: string }) =>
  result.message !== undefined ? NextResponse.json({ error: result.code, message: result.message }, { status: result.code === 'NOT_CONFIGURED' ? 503 : 400 }) : moneyResult(result);

/** ข้อมูลที่นำเข้าแล้ว (ปีงบ summaries for the files page) or every record decrypted with the summaries (`?full=1`, for the dashboard). */
export async function GET(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const dp = service(database);
    if (new URL(request.url).searchParams.get('full') === '1') {
      const result = await dp.all(session);
      if (!result.ok) return failed(result);
      return NextResponse.json({ years: result.years, records: result.records }, { headers: { 'cache-control': 'no-store' } });
    }
    const result = await dp.summaries(session);
    if (!result.ok) return failed(result);
    return NextResponse.json({ years: result.years }, { headers: { 'cache-control': 'no-store' } });
  });
}

/** นำเข้าไฟล์บริการฟื้นฟู, one part at a time: ผู้ดูแล Smart Money only, refused before the body is read. */
export async function POST(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!canManageMoney(session)) return forbidden();
    if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY) return tooLarge();
    const text = await readCapped(request, MAX_BODY);
    if (text === null) return tooLarge();
    let body: unknown;
    try { body = JSON.parse(text); } catch { body = null; }
    const parsed = dpUploadSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'invalid_input', fields: [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? '')))].filter(Boolean) }, { status: 400 });
    const result = await service(database).upload(session, parsed.data);
    return result.ok ? NextResponse.json(result) : failed(result);
  });
}

/** ลบข้อมูลทั้งปีงบ (`{fy}` in the body): ผู้ดูแล Smart Money only, refused before the body is read. */
export async function DELETE(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!canManageMoney(session)) return forbidden();
    const text = await readCapped(request, 1024);
    let body: unknown = null;
    try { body = text === null ? null : JSON.parse(text); } catch { body = null; }
    const parsed = dpRemoveSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'invalid_input', fields: ['fy'] }, { status: 400 });
    return moneyResult(await service(database).removeYear(session, parsed.data.fy));
  });
}
