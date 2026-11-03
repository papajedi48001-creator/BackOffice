import { NextResponse } from 'next/server';
import { lineAlertModuleCodes, lineRouteInputSchema } from '@backoffice/contracts';
import { LineService } from '@backoffice/core';
import { adminResult, readInput, withAdmin } from '../../../admin-route';

/** กลุ่มแจ้งเตือนของโมดูล: one group, or null for "ไม่ส่ง LINE". */
export async function PUT(request: Request, { params }: { params: Promise<{ code: string }> }): Promise<Response> {
  return withAdmin(request, async (session, database) => {
    const { code } = await params;
    if (!(lineAlertModuleCodes as readonly string[]).includes(code)) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    const input = await readInput(request, lineRouteInputSchema);
    if (!input.ok) return input.response;
    return adminResult(await new LineService(database).setRoute(session.personId, code, input.value.groupId));
  });
}
