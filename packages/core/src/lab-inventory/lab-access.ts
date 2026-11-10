import type { AccessSubject, LabMemberRole } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { AuthorizationService } from '../access/authorization-service';

const authorization = new AuthorizationService();

/** ผู้ดูแลระบบ or ผู้จัดการวัสดุคงคลัง Lab (`lab.manage`): everything in the module, and the only one who manages members. */
export function canManageLab(subject: AccessSubject): boolean {
  return authorization.organizationScope(subject, 'lab.manage') === 'all';
}

/** The person's membership of the module; `null` when not a member. */
export type LabMember = { role: LabMemberRole; sectionIds: string[] } | null;
export type LabAction = 'manageMembers' | 'manageSettings' | 'editOpening' | 'certifyOpening' | 'receive' | 'request' | 'decide' | 'issue' | 'use' | 'reverseAnyUse' | 'viewStock';

const byRole: Record<LabMemberRole, ReadonlySet<LabAction>> = {
  HEAD: new Set(['certifyOpening', 'request', 'decide', 'use', 'viewStock']),
  KEEPER: new Set(['manageSettings', 'editOpening', 'receive', 'request', 'issue', 'use', 'reverseAnyUse', 'viewStock']),
  STAFF: new Set(['request', 'use', 'viewStock'])
};

/**
 * What a member may do (spec table). `manages` (a `lab.manage` holder) may do everything. `sectionId` is the งาน acted on
 * (`null` = คลังหลัก); a เจ้าหน้าที่ Lab acts only in their own งาน.
 */
export function labCan(member: LabMember, manages: boolean, action: LabAction, sectionId?: string | null): boolean {
  if (manages) return true;
  if (!member || !byRole[member.role].has(action)) return false;
  if (member.role === 'STAFF') return Boolean(sectionId) && member.sectionIds.includes(sectionId as string);
  return true;
}

export async function loadLabMember(database: Database, personId: string): Promise<LabMember> {
  const rows = await database.query<{ role: LabMemberRole; section_id: string | null }>('SELECT m.role, s.section_id FROM lab_member m LEFT JOIN lab_member_section s ON s.person_id = m.person_id WHERE m.person_id = ?', [personId]);
  if (rows.length === 0) return null;
  return { role: rows[0]!.role, sectionIds: rows.flatMap((row) => (row.section_id ? [row.section_id] : [])) };
}
