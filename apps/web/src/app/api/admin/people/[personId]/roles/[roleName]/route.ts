import { grantableRoleSchema } from '@backoffice/contracts';
import { adminResult, adminService, forbidden, invalid, withRoleGrant } from '../../../../admin-route';

/** ลบสิทธิ: takes one role from one person (a ผู้จัดการโมดูล: only their own module's ผู้ทดสอบ role); the last ผู้ดูแลระบบ stays. */
export async function DELETE(request: Request, { params }: { params: Promise<{ personId: string; roleName: string }> }): Promise<Response> {
  return withRoleGrant(request, async (session, database, may) => {
    const { personId, roleName } = await params;
    const role = grantableRoleSchema.safeParse(roleName);
    if (!role.success) return invalid('roleName');
    if (!may(role.data)) return forbidden();
    return adminResult(await adminService(database).revokeRole(session.personId, personId, role.data));
  });
}
