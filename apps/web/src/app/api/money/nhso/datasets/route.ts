import { NextResponse } from 'next/server';
import { nhsoUploadSchema } from '@backoffice/contracts';
import { canManageMoney, NhsoDatasetService } from '@backoffice/core';
import { forbidden, moneyResult, withSessionAndDatabase } from '../../money-route';

/** A report of 20,000 rows × 80 short cells fits well under this; anything larger is refused before it is parsed. */
const MAX_BODY = 16 * 1024 * 1024;
const tooLarge = () => NextResponse.json({ error: 'TOO_LARGE', message: 'ไฟล์ใหญ่เกินไป' }, { status: 413 });

/** The body as text, or null once it passes `limit` bytes; stops reading there, so a chunked body without a length cannot grow without bound. */
async function readCapped(request: Request, limit: number): Promise<string | null> {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel().catch(() => undefined); return null; }
    parts.push(value);
  }
  return Buffer.concat(parts).toString('utf8');
}

/** ข้อมูลในระบบ: summaries for the files page, or every dataset with its rows (`?rows=1`) for the dashboard. */
export async function GET(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const service = new NhsoDatasetService(database);
    const result = new URL(request.url).searchParams.get('rows') === '1' ? await service.all(session) : await service.list(session);
    if (!result.ok) return moneyResult(result);
    return NextResponse.json({ datasets: result.datasets }, { headers: { 'cache-control': 'no-store' } });
  });
}

/** นำเข้าไฟล์: one report as the browser read it; ผู้ดูแล Smart Money only, refused before the body is read (the service checks again). */
export async function POST(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!canManageMoney(session)) return forbidden();
    if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY) return tooLarge();
    const text = await readCapped(request, MAX_BODY);
    if (text === null) return tooLarge();
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
