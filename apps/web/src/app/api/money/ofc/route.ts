import { NextResponse } from 'next/server';
import { ofcUploadSchema } from '@backoffice/contracts';
import { canManageMoney } from '@backoffice/core';
import { ofcService } from '../../../../lib/hosxp';
import { forbidden, moneyResult, readCapped, withSessionAndDatabase } from '../money-route';

/** One OFC Statement of 20,000 rows fits under this; anything larger is refused while it is being read. */
const MAX_BODY = 8 * 1024 * 1024;
const tooLarge = () => NextResponse.json({ error: 'TOO_LARGE', message: 'ไฟล์ใหญ่เกินไป' }, { status: 413 });

/** นำเข้า REP / Statement ของ OFC: ผู้ดูแล Smart Money only, refused before the body is read. The page itself is read on the server. */
export async function POST(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!canManageMoney(session)) return forbidden();
    if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY) return tooLarge();
    const text = await readCapped(request, MAX_BODY);
    if (text === null) return tooLarge();
    let body: unknown;
    try { body = JSON.parse(text); } catch { body = null; }
    const parsed = ofcUploadSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'invalid_input', fields: [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? '')))].filter(Boolean) }, { status: 400 });
    const result = await ofcService(database).upload(session, parsed.data);
    if (result.ok) return NextResponse.json(result);
    return 'message' in result ? NextResponse.json({ error: result.code, message: result.message }, { status: 400 }) : moneyResult(result);
  });
}
