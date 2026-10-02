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
}
