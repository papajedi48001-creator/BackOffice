import { describe, expect, it } from 'vitest';
import { AuthorizationService } from './authorization-service';

describe('AuthorizationService', () => {
  it('denies a role holder outside the assigned organization scope', async () => {
    const authorization = new AuthorizationService();

    await expect(authorization.canAccess(
      { authenticated: true, personId: 'person-a', roles: [{ name: 'hr-reader', organizationId: 'unit-a' }], dataOwnerModules: [] },
      'hr.person.read',
      { moduleCode: 'hr', organizationId: 'unit-b' }
    )).resolves.toEqual({ allowed: false, reason: 'organization_scope_denied' });
  });

  it('requires data-owner approval for sensitive module actions', async () => {
    const authorization = new AuthorizationService();

    await expect(authorization.canAccess(
      { authenticated: true, personId: 'person-a', roles: [{ name: 'hr-manager', organizationId: 'unit-a' }], dataOwnerModules: [] },
      'hr.person.manage',
      { moduleCode: 'hr', organizationId: 'unit-a' }
    )).resolves.toEqual({ allowed: false, reason: 'data_owner_required' });
  });
});
