import { adminPersonRolesInputSchema, adminRoleInputSchema } from '@backoffice/contracts';
import { adminResult, adminService, forbidden, readInput, withAdmin, withRoleGrant } from '../../../admin-route';
/** เพิ่มสิทธิ: gives one person one role; a ผู้จัดการโมดูล may give only their own module's ผู้ทดสอบ role. */
export async function POST(request: Request, { params }: { params: Promise<{ personId: string }> }): Promise<Response> {
  return withRoleGrant(request, async (session, database, may) => {
    const { personId } = await params;
    const input = await readInput(request, adminRoleInputSchema);
    if (!input.ok) return input.response;
    if (!may(input.value.roleName)) return forbidden();
    return adminResult(await adminService(database).grantRole(session.personId, personId, input.value.roleName), 201);
  });
}

/** แก้ไขสิทธิ: the person ends up with exactly these admin and manager roles. */
export async function PUT(request: Request, { params }: { params: Promise<{ personId: string }> }): Promise<Response> {
  return withAdmin(request, async (session, database) => {
    const { personId } = await params;
    const input = await readInput(request, adminPersonRolesInputSchema);
    if (!input.ok) return input.response;
    return adminResult(await adminService(database).setPersonRoles(session.personId, personId, input.value.roleNames));
  });
}
