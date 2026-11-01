import { grantableRoleSchema } from '@backoffice/contracts';
import { adminResult, adminService, invalid, withAdmin } from '../../../../admin-route';

/** ลบสิทธิ: takes one admin or manager role from one person; the last ผู้ดูแลระบบ stays. */
export async function DELETE(request: Request, { params }: { params: Promise<{ personId: string; roleName: string }> }): Promise<Response> {
  return withAdmin(request, async (session, database) => {
    const { personId, roleName } = await params;
    const role = grantableRoleSchema.safeParse(roleName);
    if (!role.success) return invalid('roleName');
    return adminResult(await adminService(database).revokeRole(session.personId, personId, role.data));
  });
}
