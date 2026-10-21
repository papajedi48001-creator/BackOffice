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
