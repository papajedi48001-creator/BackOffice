import { NextResponse } from 'next/server';
import { verifyChain } from '@backoffice/core';
import { canReadAttendanceAudit, forbidden, withSessionAndDatabase } from '../../attendance-route';

/** ตรวจสอบความต่อเนื่องของสายแฮช; ผู้ตรวจสอบระบบลงเวลา and the managers. Reads only. */
export function POST(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!canReadAttendanceAudit(session)) return forbidden();
    return NextResponse.json(await verifyChain(database), { headers: { 'cache-control': 'no-store' } });
  });
}
