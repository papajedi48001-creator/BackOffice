import { describe, expect, it } from 'vitest';
import { ADMIN_TIER, EMPLOYEE_ROLE, MANAGER_TIER, resolveActiveRole, roleChoices } from './active-role';
import { AuthorizationService } from './authorization-service';
import { canUseModule } from '../admin/module-managers';

const roles = [{ name: 'leave-manager', organizationId: null }, { name: 'admin', organizationId: null }, { name: 'hr-reader', organizationId: 'unit-a' }, { name: 'hr-reader', organizationId: 'unit-b' }, { name: 'fleet-tester', organizationId: null }];

describe('active role', () => {
  it('offers at most the two tiers ผู้ดูแลระบบ and ผู้จัดการ, whatever roles are held', () => {
    expect(roleChoices(roles)).toEqual([ADMIN_TIER, MANAGER_TIER]);
    expect(roleChoices([{ name: 'hr-manager', organizationId: null }, { name: 'leave-manager', organizationId: null }])).toEqual([MANAGER_TIER]);
    expect(roleChoices([{ name: 'admin', organizationId: null }])).toEqual([ADMIN_TIER]);
  });

  it('needs a choice when both tiers are held and grants no role until then', () => {
    expect(resolveActiveRole(roles, null)).toEqual({ activeRole: null, roleChoices: [ADMIN_TIER, MANAGER_TIER], roleSelectionRequired: true, roles: [] });
  });

  it('works as ผู้ดูแลระบบ with every held role', () => {
    expect(resolveActiveRole(roles, ADMIN_TIER)).toMatchObject({ activeRole: ADMIN_TIER, roleSelectionRequired: false, roles });
  });

  it('works as ผู้จัดการ with every held role except admin, unit scopes and tester roles kept', () => {
    expect(resolveActiveRole(roles, MANAGER_TIER)).toMatchObject({ activeRole: MANAGER_TIER, roleSelectionRequired: false, roles: roles.filter((role) => role.name !== 'admin') });
  });

  it('lets a person with roles work as บุคลากรทั่วไป with no role', () => {
    expect(resolveActiveRole(roles, EMPLOYEE_ROLE)).toMatchObject({ activeRole: EMPLOYEE_ROLE, roleSelectionRequired: false, roles: [] });
  });

  it('sends a choice saved before the tiers back to the picker, and auto-selects a single tier', () => {
    expect(resolveActiveRole(roles, 'leave-manager')).toMatchObject({ activeRole: null, roleSelectionRequired: true, roles: [] });
    expect(resolveActiveRole([{ name: 'fleet-manager', organizationId: null }, { name: 'hr-manager', organizationId: null }], null)).toMatchObject({ activeRole: MANAGER_TIER, roleSelectionRequired: false, roles: [{ name: 'fleet-manager', organizationId: null }, { name: 'hr-manager', organizationId: null }] });
    expect(resolveActiveRole([], 'admin')).toEqual({ activeRole: EMPLOYEE_ROLE, roleChoices: [], roleSelectionRequired: false, roles: [] });
  });

  it('authorizes with the tier chosen: ผู้จัดการ keeps module rights but not ผู้ดูแลระบบ', async () => {
    const asManager = { authenticated: true, personId: 'p', ...resolveActiveRole(roles, MANAGER_TIER), dataOwnerModules: ['hr'], hospitalWideDataOwnerModules: ['hr'] };
    const asEmployee = { ...asManager, ...resolveActiveRole(roles, EMPLOYEE_ROLE) };
    const authorization = new AuthorizationService();
    await expect(authorization.canAccess(asManager, 'leave.manage', { moduleCode: 'hr', organizationId: 'unit-a' })).resolves.toMatchObject({ allowed: true });
    expect(asManager.roles.some((role) => role.name === 'admin')).toBe(false);
    expect(canUseModule(asManager, 'fleet', 'DEVELOPMENT')).toBe(true);
    await expect(authorization.canAccess(asEmployee, 'leave.manage', { moduleCode: 'hr', organizationId: 'unit-a' })).resolves.toMatchObject({ allowed: false });
  });
});

describe('canDecideOwnRequest', () => {
  it('is open to the admin and manager tiers only', async () => {
    const { canDecideOwnRequest } = await import('./active-role');
    expect(['admin', 'manager', 'employee', null, undefined].map(canDecideOwnRequest)).toEqual([true, true, false, false, false]);
  });
});
