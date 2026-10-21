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

describe('AuthorizationService room booking permissions', () => {
  const approver = { authenticated: true, personId: 'person-a', roles: [{ name: 'room-booking-approver', organizationId: 'unit-a' }], dataOwnerModules: [] };

  it('lets a room booking approver decide bookings for rooms in their organization only', async () => {
    const authorization = new AuthorizationService();
    await expect(authorization.canAccess(approver, 'room.booking.decide', { moduleCode: 'room-booking', organizationId: 'unit-a' })).resolves.toEqual({ allowed: true, reason: 'allowed' });
    await expect(authorization.canAccess(approver, 'room.booking.decide', { moduleCode: 'room-booking', organizationId: 'unit-b' })).resolves.toEqual({ allowed: false, reason: 'organization_scope_denied' });
  });

  it('lets a room manager manage rooms without a data-owner assignment', async () => {
    const authorization = new AuthorizationService();
    await expect(authorization.canAccess({ ...approver, roles: [{ name: 'room-manager', organizationId: null }] }, 'room.manage', { moduleCode: 'room-booking', organizationId: 'unit-b' })).resolves.toEqual({ allowed: true, reason: 'allowed' });
  });

  it('does not let a room manager decide bookings', async () => {
    const authorization = new AuthorizationService();
    await expect(authorization.canAccess({ ...approver, roles: [{ name: 'room-manager', organizationId: null }] }, 'room.booking.decide', { moduleCode: 'room-booking', organizationId: 'unit-a' })).resolves.toEqual({ allowed: false, reason: 'permission_denied' });
  });
});

describe('organization scope for listings', () => {
  const service = new AuthorizationService();
  const subject = (roles: { name: string; organizationId: string | null }[], dataOwnerModules: string[] = []) => ({ authenticated: true, personId: 'person-a', roles, dataOwnerModules, hospitalWideDataOwnerModules: dataOwnerModules });

  it('returns all for a hospital-wide role and the covered units for scoped roles', () => {
    expect(service.organizationScope(subject([{ name: 'hr-reader', organizationId: null }]), 'hr.person.read')).toBe('all');
    expect(service.organizationScope(subject([{ name: 'hr-reader', organizationId: 'unit-a' }, { name: 'hr-manager', organizationId: 'unit-b' }, { name: 'data-exporter', organizationId: 'unit-c' }]), 'hr.person.read')).toEqual(['unit-a', 'unit-b']);
    expect(service.organizationScope(subject([]), 'hr.person.read')).toEqual([]);
  });

  it('allows hospital-wide actions only for an unscoped role that also owns the module data', () => {
    expect(service.canActHospitalWide(subject([{ name: 'hr-manager', organizationId: null }], ['hr']), 'hr.person.manage', 'hr')).toBe(true);
    expect(service.canActHospitalWide(subject([{ name: 'hr-manager', organizationId: 'unit-a' }], ['hr']), 'hr.person.manage', 'hr')).toBe(false);
    expect(service.canActHospitalWide(subject([{ name: 'hr-manager', organizationId: null }]), 'hr.person.manage', 'hr')).toBe(false);
    // Data owner for one unit only.
    expect(service.canActHospitalWide({ ...subject([{ name: 'hr-manager', organizationId: null }], ['hr']), hospitalWideDataOwnerModules: [] }, 'hr.person.manage', 'hr')).toBe(false);
    expect(service.canActHospitalWide({ ...subject([{ name: 'hr-manager', organizationId: null }], ['hr']), authenticated: false }, 'hr.person.manage', 'hr')).toBe(false);
  });
});
