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

describe('organization scope for listings', () => {
  const service = new AuthorizationService();
  const subject = (roles: { name: string; organizationId: string | null }[], dataOwnerModules: string[] = []) => ({ authenticated: true, personId: 'person-a', roles, dataOwnerModules });

  it('returns all for a hospital-wide role and the covered units for scoped roles', () => {
    expect(service.organizationScope(subject([{ name: 'hr-reader', organizationId: null }]), 'hr.person.read')).toBe('all');
    expect(service.organizationScope(subject([{ name: 'hr-reader', organizationId: 'unit-a' }, { name: 'hr-manager', organizationId: 'unit-b' }, { name: 'data-exporter', organizationId: 'unit-c' }]), 'hr.person.read')).toEqual(['unit-a', 'unit-b']);
    expect(service.organizationScope(subject([]), 'hr.person.read')).toEqual([]);
  });

  it('allows hospital-wide actions only for an unscoped role that also owns the module data', () => {
    expect(service.canActHospitalWide(subject([{ name: 'hr-manager', organizationId: null }], ['hr']), 'hr.person.manage', 'hr')).toBe(true);
    expect(service.canActHospitalWide(subject([{ name: 'hr-manager', organizationId: 'unit-a' }], ['hr']), 'hr.person.manage', 'hr')).toBe(false);
    expect(service.canActHospitalWide(subject([{ name: 'hr-manager', organizationId: null }]), 'hr.person.manage', 'hr')).toBe(false);
    expect(service.canActHospitalWide({ ...subject([{ name: 'hr-manager', organizationId: null }], ['hr']), authenticated: false }, 'hr.person.manage', 'hr')).toBe(false);
  });
});
