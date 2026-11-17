import { NextResponse } from 'next/server';
import { adminModuleAppearanceInputSchema } from '@backoffice/contracts';
import { moduleRegistry } from '../../../../../../lib/modules';
import { adminResult, adminService, readInput, withAdmin } from '../../../admin-route';

/** ตั้งค่าโปรแกรม: a live module's สีและไอคอน, from the fixed palette and icon list; null puts back the default. */
export async function PUT(request: Request, { params }: { params: Promise<{ code: string }> }): Promise<Response> {
  return withAdmin(request, async (session, database) => {
    const { code } = await params;
    if (!moduleRegistry.some((entry) => entry.code === code && entry.status === 'live')) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    const input = await readInput(request, adminModuleAppearanceInputSchema);
    if (!input.ok) return input.response;
    return adminResult(await adminService(database).setModuleAppearance(session.personId, code, input.value));
  });
}
