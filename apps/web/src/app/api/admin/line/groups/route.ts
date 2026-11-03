import { NextResponse } from 'next/server';
import { lineGroupInputSchema } from '@backoffice/contracts';
import { LineService } from '@backoffice/core';
import { readInput, withAdmin } from '../../admin-route';

/** เพิ่มกลุ่ม LINE เอง (ผู้ดูแลระบบ). */
export async function POST(request: Request): Promise<Response> {
  return withAdmin(request, async (session, database) => {
    const input = await readInput(request, lineGroupInputSchema);
    if (!input.ok) return input.response;
    return NextResponse.json(await new LineService(database).addGroup(session.personId, input.value), { status: 201 });
  });
}
