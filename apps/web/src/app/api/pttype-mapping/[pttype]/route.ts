import { NextResponse } from 'next/server';
import { hosxpCodeSchema, pttypeMappingInputSchema } from '@backoffice/contracts';
import { pttypeMappingService } from '../../../../lib/hosxp';
import { readInput, withSessionAndDatabase } from '../../hr/profile-route';

const statusByCode: Record<string, number> = { FORBIDDEN: 403, NOT_FOUND: 404, STALE: 409, INVALID_ACCOUNT: 422, NO_CHANGE: 422, NO_WRITE_PERMISSION: 503, HOSXP_FAILED: 503, NOT_CONFIGURED: 503 };

/** ผูกผังบัญชี of one สิทธิ in HOSxP. Only ผู้ดูแลระบบ and ผู้จัดการโมดูล Mapping สิทธิ (checked by the service). */
export async function PUT(request: Request, { params }: { params: Promise<{ pttype: string }> }): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const { pttype } = await params;
    if (!hosxpCodeSchema.safeParse(pttype).success) return NextResponse.json({ error: 'invalid_input', fields: ['pttype'] }, { status: 400 });
    const input = await readInput(request, pttypeMappingInputSchema);
    if (!input.ok) return input.response;
    const result = await pttypeMappingService(database).save(session, pttype, input.value);
    return result.ok ? NextResponse.json(result) : NextResponse.json({ error: result.code }, { status: statusByCode[result.code] ?? 400 });
  });
}
