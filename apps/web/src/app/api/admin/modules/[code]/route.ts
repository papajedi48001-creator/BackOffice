import { NextResponse } from 'next/server';
import { adminModuleToggleInputSchema } from '@backoffice/contracts';
import { moduleRegistry } from '../../../../../lib/modules';
import { adminResult, adminService, readInput, withAdmin } from '../../admin-route';

/** ตั้งค่าโปรแกรม: switches one live module on or off. */
export async function PUT(request: Request, { params }: { params: Promise<{ code: string }> }): Promise<Response> {
  return withAdmin(request, async (session, database) => {
    const { code } = await params;
    if (!moduleRegistry.some((entry) => entry.code === code && entry.status === 'live')) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    const input = await readInput(request, adminModuleToggleInputSchema);
    if (!input.ok) return input.response;
    return adminResult(await adminService(database).setModuleEnabled(session.personId, code, input.value.enabled));
  });
}
