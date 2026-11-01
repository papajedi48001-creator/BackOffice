import { adminPersonRolesInputSchema, adminRoleInputSchema } from '@backoffice/contracts';
import { adminResult, adminService, readInput, withAdmin } from '../../../admin-route';


/** เพิ่มสิทธิ: gives one person one admin or manager role. */
export async function POST(request: Request, { params }: { params: Promise<{ personId: string }> }): Promise<Response> {
  return withAdmin(request, async (session, database) => {
    const { personId } = await params;
    const input = await readInput(request, adminRoleInputSchema);
    if (!input.ok) return input.response;
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
