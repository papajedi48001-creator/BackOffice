import type { AccessResource, AccessSubject, AuthorizationDecision, Permission } from '@backoffice/contracts';
import { managesPermission } from './module-manager-scope';
import { requiresDataOwner, roleGrantsPermission } from './policy';

/** ผู้ดูแลระบบ: the system role that may grant roles and switch modules. */
export const ADMIN_ROLE = 'admin';

/**
 * An unscoped `admin` assignment. A ผู้ดูแลระบบ is ผู้จัดการ of every module, so the checks below let them through
 * hospital-wide, data-owner gates included (a deliberate exception, see CONTEXT.md). `roleGrantsPermission` stays unchanged,
 * so admins are not added to module recipient lists such as the fleet managers.
 */
export function isAdmin(subject: AccessSubject): boolean {
  return Boolean(subject.authenticated && subject.personId) && subject.roles.some((role) => role.name === ADMIN_ROLE && (role.organizationId === null || role.organizationId === undefined));
}

/**
 * ผู้จัดการโมดูล acts as ผู้ดูแลระบบ inside the modules they manage (see `permissionModules`): any unit, no data-owner gate.
 * Permissions of other modules go through the normal checks.
 */
export class AuthorizationService {
  async canAccess(subject: AccessSubject, action: Permission, resource: AccessResource): Promise<AuthorizationDecision> {
    if (!subject.authenticated || !subject.personId) return { allowed: false, reason: 'unauthenticated' };
    if (isAdmin(subject) || managesPermission(subject, action, resource.moduleCode)) return { allowed: true, reason: 'allowed' };
    const permittedRoles = subject.roles.filter((role) => roleGrantsPermission(role.name, action));
    if (permittedRoles.length === 0) return { allowed: false, reason: 'permission_denied' };
    if (!permittedRoles.some((role) => role.organizationId === null || role.organizationId === undefined || role.organizationId === resource.organizationId)) {
      return { allowed: false, reason: 'organization_scope_denied' };
    }
    if (requiresDataOwner(action) && !subject.dataOwnerModules.includes(resource.moduleCode)) {
      return { allowed: false, reason: 'data_owner_required' };
    }
    return { allowed: true, reason: 'allowed' };
  }

  /** Units whose people this subject may see for `action`: `all` when any granting role is hospital-wide. */
  organizationScope(subject: AccessSubject, action: Permission): 'all' | string[] {
    if (!subject.authenticated || !subject.personId) return [];
    if (isAdmin(subject) || managesPermission(subject, action)) return 'all';
    const permittedRoles = subject.roles.filter((role) => roleGrantsPermission(role.name, action));
    if (permittedRoles.some((role) => role.organizationId === null || role.organizationId === undefined)) return 'all';
    return [...new Set(permittedRoles.map((role) => role.organizationId as string))];
  }

  /** For actions that touch every unit at once, such as a master-data import: needs an unscoped role and, where required, hospital-wide data ownership. */
  canActHospitalWide(subject: AccessSubject, action: Permission, moduleCode: string): boolean {
    if (isAdmin(subject) || managesPermission(subject, action, moduleCode)) return true;
    if (this.organizationScope(subject, action) !== 'all') return false;
    return !requiresDataOwner(action) || (subject.hospitalWideDataOwnerModules ?? []).includes(moduleCode);
  }
}
