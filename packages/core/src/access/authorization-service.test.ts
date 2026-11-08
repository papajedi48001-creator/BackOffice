import { describe, expect, it } from 'vitest';
import type { Permission } from '@backoffice/contracts';
import { permissionModules } from '@backoffice/contracts';
import { managedModules } from './module-manager-scope';
import { AuthorizationService, isAdmin } from './authorization-service';
import { canManageFleet } from '../fleet/fleet-access';
import { canManageLeave } from '../leave/leave-access';
import { canManageTravel } from '../official-travel/travel-access';
import { requiresDataOwner, roleGrantsPermission } from './policy';

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

  it('lets the room module manager give the final approval on bookings, within their unit', async () => {
    const authorization = new AuthorizationService();
    const manager = { ...approver, roles: [{ name: 'room-manager', organizationId: 'unit-a' }] };
    await expect(authorization.canAccess(manager, 'room.booking.decide', { moduleCode: 'room-booking', organizationId: 'unit-a' })).resolves.toEqual({ allowed: true, reason: 'allowed' });
    await expect(authorization.canAccess(manager, 'room.booking.decide', { moduleCode: 'room-booking', organizationId: 'unit-b' })).resolves.toMatchObject({ allowed: false });
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
    // A hospital-wide hr-manager is ผู้จัดการโมดูล of hr and acts as admin there; the data-owner gate still holds for other unscoped holders.
    expect(service.canActHospitalWide(subject([{ name: 'hr-manager', organizationId: null }]), 'hr.person.manage', 'hr')).toBe(true);
    expect(service.canActHospitalWide(subject([{ name: 'hr-manager', organizationId: null }]), 'leave.manage', 'hr')).toBe(false);
    // Data owner for one unit only.
    expect(service.canActHospitalWide({ ...subject([{ name: 'hr-manager', organizationId: null }], ['hr']), hospitalWideDataOwnerModules: [] }, 'leave.manage', 'hr')).toBe(false);
    expect(service.canActHospitalWide({ ...subject([{ name: 'hr-manager', organizationId: null }], ['hr']), authenticated: false }, 'hr.person.manage', 'hr')).toBe(false);
  });

  it('lets an hr manager who owns hr data manage organizations hospital-wide', () => {
    expect(service.canActHospitalWide(subject([{ name: 'hr-manager', organizationId: null }], ['hr']), 'hr.organization.manage', 'hr')).toBe(true);
    expect(service.canActHospitalWide(subject([{ name: 'hr-reader', organizationId: null }], ['hr']), 'hr.organization.manage', 'hr')).toBe(false);
    expect(requiresDataOwner('hr.organization.manage')).toBe(true);
  });

  it('lets only an hr manager who owns hr data read private profile details', async () => {
    const authorization = new AuthorizationService();
    const manager = { authenticated: true, personId: 'person-a', roles: [{ name: 'hr-manager', organizationId: null }], dataOwnerModules: ['hr'] };
    await expect(authorization.canAccess(manager, 'hr.person.private.read', { moduleCode: 'hr', organizationId: 'unit-a' })).resolves.toEqual({ allowed: true, reason: 'allowed' });
    await expect(authorization.canAccess({ ...manager, roles: [{ name: 'hr-reader', organizationId: null }] }, 'hr.person.private.read', { moduleCode: 'hr', organizationId: 'unit-a' })).resolves.toEqual({ allowed: false, reason: 'permission_denied' });
    expect(requiresDataOwner('hr.person.private.read')).toBe(true);
  });
});

describe('AuthorizationService ผู้ดูแลระบบ', () => {
  const admin = { authenticated: true, personId: 'person-admin', roles: [{ name: 'admin', organizationId: null }], dataOwnerModules: [] };

  it('lets an unscoped admin pass every module-manager check without a data-owner assignment', async () => {
    const authorization = new AuthorizationService();
    expect(isAdmin(admin)).toBe(true);
    await expect(authorization.canAccess(admin, 'hr.person.manage', { moduleCode: 'hr', organizationId: 'unit-a' })).resolves.toEqual({ allowed: true, reason: 'allowed' });
    expect(authorization.organizationScope(admin, 'inventory.stock.read')).toBe('all');
    expect(authorization.canActHospitalWide(admin, 'leave.manage', 'hr')).toBe(true);
    expect(canManageLeave(admin)).toBe(true);
    expect(canManageTravel(admin)).toBe(true);
    expect(canManageFleet(admin)).toBe(true);
  });

  it('does not treat a unit-scoped admin assignment or a signed-out subject as admin', () => {
    expect(isAdmin({ ...admin, roles: [{ name: 'admin', organizationId: 'unit-a' }] })).toBe(false);
    expect(isAdmin({ ...admin, authenticated: false })).toBe(false);
  });

  it('gives the new leave and travel manager roles their one permission', () => {
    expect(roleGrantsPermission('leave-manager', 'leave.manage')).toBe(true);
    expect(roleGrantsPermission('travel-manager', 'travel.manage')).toBe(true);
    expect(roleGrantsPermission('admin', 'fleet.manage')).toBe(false);
  });
});

describe('AuthorizationService ผู้จัดการโมดูล acts as admin inside the modules they manage', () => {
  const authorization = new AuthorizationService();
  const manager = (name: string, organizationId: string | null = null) => ({ authenticated: true, personId: 'person-m', roles: [{ name, organizationId }], dataOwnerModules: [], hospitalWideDataOwnerModules: [] });
  const table: { role: string; module: string; own: Permission[]; other: Permission }[] = [
    { role: 'hr-manager', module: 'hr', own: ['hr.person.read', 'hr.person.manage', 'hr.organization.manage', 'hr.person.private.read'], other: 'fleet.manage' },
    { role: 'leave-manager', module: 'leave', own: ['leave.manage'], other: 'travel.manage' },
    { role: 'travel-manager', module: 'official-travel', own: ['travel.manage'], other: 'leave.manage' },
    { role: 'room-manager', module: 'room-booking', own: ['room.manage', 'room.booking.decide'], other: 'inventory.stock.read' },
    { role: 'inventory-officer', module: 'inventory', own: ['inventory.item.manage', 'inventory.stock.receive', 'inventory.stock.read', 'inventory.opening.certify'], other: 'room.manage' },
    { role: 'fleet-manager', module: 'fleet', own: ['fleet.manage'], other: 'hr.person.read' }
  ];

  it.each(table)('$role: every $module permission like an admin, nothing outside it', async ({ role, module, own, other }) => {
    const subject = manager(role);
    expect(managedModules(subject)).toEqual([module]);
    for (const permission of own) {
      expect(permissionModules[permission]).toBe(module);
      await expect(authorization.canAccess(subject, permission, { moduleCode: module, organizationId: 'unit-x' })).resolves.toEqual({ allowed: true, reason: 'allowed' });
      expect(authorization.organizationScope(subject, permission)).toBe('all');
      expect(authorization.canActHospitalWide(subject, permission, module)).toBe(true);
    }
    await expect(authorization.canAccess(subject, other, { moduleCode: permissionModules[other] as string, organizationId: 'unit-x' })).resolves.toMatchObject({ allowed: false });
    expect(authorization.organizationScope(subject, other)).toEqual([]);
    await expect(authorization.canAccess(subject, 'data.export', { moduleCode: module, organizationId: 'unit-x' })).resolves.toEqual({ allowed: true, reason: 'allowed' });
    await expect(authorization.canAccess(subject, 'data.export', { moduleCode: module === 'hr' ? 'fleet' : 'hr', organizationId: 'unit-x' })).resolves.toMatchObject({ allowed: false });
  });

  it('does not treat a unit-scoped manager assignment or a signed-out subject as a module manager', async () => {
    expect(managedModules(manager('fleet-manager', 'unit-a'))).toEqual([]);
    expect(managedModules({ ...manager('fleet-manager'), authenticated: false })).toEqual([]);
    await expect(authorization.canAccess(manager('hr-manager', 'unit-a'), 'hr.person.manage', { moduleCode: 'hr', organizationId: 'unit-a' })).resolves.toEqual({ allowed: false, reason: 'data_owner_required' });
  });

  it('keeps the data-owner gate on leave and travel for an hr-manager, whose module is hr', async () => {
    await expect(authorization.canAccess(manager('hr-manager'), 'leave.manage', { moduleCode: 'hr', organizationId: 'unit-a' })).resolves.toEqual({ allowed: false, reason: 'data_owner_required' });
    expect(canManageLeave(manager('leave-manager'))).toBe(true);
    expect(canManageTravel(manager('travel-manager'))).toBe(true);
    expect(canManageLeave(manager('hr-manager'))).toBe(false);
  });
});
