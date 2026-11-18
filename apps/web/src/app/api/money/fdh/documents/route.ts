import { NextResponse } from 'next/server';
import { fdhKindSchema, fdhUploadSchema } from '@backoffice/contracts';
import { canManageMoney, FdhDocumentService } from '@backoffice/core';
import { getNationalIdProtector } from '../../../../../lib/national-id';
import { forbidden, moneyResult, readCapped, withSessionAndDatabase } from '../../money-route';

/** A REP of 30,000 visits × 120 short cells fits under this; anything larger is refused while it is being read. */
const MAX_BODY = 24 * 1024 * 1024;
const tooLarge = () => NextResponse.json({ error: 'TOO_LARGE', message: 'ไฟล์ใหญ่เกินไป' }, { status: 413 });
const service = (database: Parameters<Parameters<typeof withSessionAndDatabase>[1]>[1]) => new FdhDocumentService(database, getNationalIdProtector());
const failed = (result: { ok: false; code: string; message?: string }) =>
  result.message !== undefined ? NextResponse.json({ error: result.code, message: result.message }, { status: result.code === 'NOT_CONFIGURED' ? 503 : 400 }) : moneyResult(result);

/** ไฟล์ที่นำเข้าแล้ว (summaries for the files page) or every document decrypted (`?full=1`, for the dashboard). */
export async function GET(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const fdh = service(database);
    const result = new URL(request.url).searchParams.get('full') === '1' ? await fdh.all(session) : await fdh.list(session);
    if (!result.ok) return failed(result);
    return NextResponse.json({ reps: result.reps, stms: result.stms }, { headers: { 'cache-control': 'no-store' } });
  });
}

/** นำเข้าไฟล์ REP/STM: the sheets as the browser read them; ผู้ดูแล Smart Money only, refused before the body is read. */
export async function POST(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!canManageMoney(session)) return forbidden();
    if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY) return tooLarge();
    const text = await readCapped(request, MAX_BODY);
    if (text === null) return tooLarge();
    let body: unknown;
    try { body = JSON.parse(text); } catch { body = null; }
    const parsed = fdhUploadSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'invalid_input', fields: [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? '')))].filter(Boolean) }, { status: 400 });
    const result = await service(database).upload(session, parsed.data);
    return result.ok ? NextResponse.json(result) : failed(result);
  });
}

/** ลบ REP หรือ STM ทั้งหมด (`?kind=rep|stm`): ผู้ดูแล Smart Money only. */
export async function DELETE(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const kind = fdhKindSchema.safeParse(new URL(request.url).searchParams.get('kind'));
    if (!kind.success) return NextResponse.json({ error: 'invalid_input', fields: ['kind'] }, { status: 400 });
    return moneyResult(await service(database).removeAll(session, kind.data));
  });
}
