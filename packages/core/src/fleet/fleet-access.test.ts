import { describe, expect, it } from 'vitest';
import { canManageFleet } from './fleet-access';
import { roleGrantsPermission, requiresDataOwner } from '../access/policy';

const subject = (roles: Array<{ name: string; organizationId: string | null }>) => ({ authenticated: true, personId: 'person-a', roles, dataOwnerModules: [] as string[] });

describe('canManageFleet', () => {
  it('needs a hospital-wide fleet-manager role', () => {
    expect(canManageFleet(subject([{ name: 'fleet-manager', organizationId: null }]))).toBe(true);
    expect(canManageFleet(subject([{ name: 'fleet-manager', organizationId: 'unit-a' }]))).toBe(false);
    expect(canManageFleet(subject([{ name: 'hr-manager', organizationId: null }]))).toBe(false);
    expect(canManageFleet({ authenticated: false, roles: [], dataOwnerModules: [] })).toBe(false);
  });
  it('is granted by the role and not gated on data ownership', () => {
    expect(roleGrantsPermission('fleet-manager', 'fleet.manage')).toBe(true);
    expect(requiresDataOwner('fleet.manage')).toBe(false);
  });
});
