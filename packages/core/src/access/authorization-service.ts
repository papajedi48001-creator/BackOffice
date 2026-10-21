import type { AccessResource, AccessSubject, AuthorizationDecision, Permission } from '@backoffice/contracts';
import { requiresDataOwner, roleGrantsPermission } from './policy';

export class AuthorizationService {
  async canAccess(subject: AccessSubject, action: Permission, resource: AccessResource): Promise<AuthorizationDecision> {
    if (!subject.authenticated || !subject.personId) return { allowed: false, reason: 'unauthenticated' };
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
    const permittedRoles = subject.roles.filter((role) => roleGrantsPermission(role.name, action));
    if (permittedRoles.some((role) => role.organizationId === null || role.organizationId === undefined)) return 'all';
    return [...new Set(permittedRoles.map((role) => role.organizationId as string))];
  }

  /** For actions that touch every unit at once, such as a master-data import: needs an unscoped role and, where required, hospital-wide data ownership. */
  canActHospitalWide(subject: AccessSubject, action: Permission, moduleCode: string): boolean {
    if (this.organizationScope(subject, action) !== 'all') return false;
    return !requiresDataOwner(action) || (subject.hospitalWideDataOwnerModules ?? []).includes(moduleCode);
  }
}
