import { describe, expect, it } from 'vitest';
import { EMPLOYEE_ROLE, resolveActiveRole, roleChoices } from './active-role';
import { AuthorizationService } from './authorization-service';
import { canUseModule } from '../admin/module-managers';

const roles = [{ name: 'leave-manager', organizationId: null }, { name: 'admin', organizationId: null }, { name: 'hr-reader', organizationId: 'unit-a' }, { name: 'hr-reader', organizationId: 'unit-b' }];

describe('active role', () => {
  it('offers each distinct role name once', () => {
    expect(roleChoices(roles)).toEqual(['admin', 'hr-reader', 'leave-manager']);
  });

  it('needs a choice for two or more roles and grants no role until then', () => {
    expect(resolveActiveRole(roles, null)).toEqual({ activeRole: null, roleChoices: ['admin', 'hr-reader', 'leave-manager'], roleSelectionRequired: true, roles: [] });
  });

  it('keeps only the chosen role with all its unit scopes', () => {
    expect(resolveActiveRole(roles, 'hr-reader')).toMatchObject({ activeRole: 'hr-reader', roleSelectionRequired: false, roles: [{ name: 'hr-reader', organizationId: 'unit-a' }, { name: 'hr-reader', organizationId: 'unit-b' }] });
  });

  it('lets a person with several roles work as บุคลากรทั่วไป with no role', () => {
    expect(resolveActiveRole(roles, EMPLOYEE_ROLE)).toMatchObject({ activeRole: EMPLOYEE_ROLE, roleSelectionRequired: false, roles: [] });
  });

  it('sends a stale role back to the picker, or auto-selects when one role is left', () => {
    expect(resolveActiveRole(roles, 'fleet-manager')).toMatchObject({ activeRole: null, roleSelectionRequired: true, roles: [] });
    expect(resolveActiveRole([{ name: 'fleet-manager', organizationId: null }], 'admin')).toMatchObject({ activeRole: 'fleet-manager', roleSelectionRequired: false, roles: [{ name: 'fleet-manager', organizationId: null }] });
    expect(resolveActiveRole([], 'admin')).toEqual({ activeRole: EMPLOYEE_ROLE, roleChoices: [], roleSelectionRequired: false, roles: [] });
  });

  it('authorizes and shows development modules with the active role only', async () => {
    const asLeave = { authenticated: true, personId: 'p', ...resolveActiveRole([...roles, { name: 'fleet-tester', organizationId: null }], 'leave-manager'), dataOwnerModules: ['hr'], hospitalWideDataOwnerModules: ['hr'] };
    const authorization = new AuthorizationService();
    await expect(authorization.canAccess(asLeave, 'leave.manage', { moduleCode: 'hr', organizationId: 'unit-a' })).resolves.toMatchObject({ allowed: true });
    await expect(authorization.canAccess(asLeave, 'hr.person.read', { moduleCode: 'hr', organizationId: 'unit-a' })).resolves.toMatchObject({ allowed: false });
    expect(canUseModule(asLeave, 'fleet', 'DEVELOPMENT')).toBe(false);
  });
});
