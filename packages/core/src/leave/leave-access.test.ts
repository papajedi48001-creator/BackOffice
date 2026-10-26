import { describe, expect, it } from 'vitest';
import { canManageLeave } from './leave-access';

const subject = (roles: Array<{ name: string; organizationId: string | null }>, hospitalWide: string[]) => ({ authenticated: true, personId: 'person-a', roles, dataOwnerModules: hospitalWide, hospitalWideDataOwnerModules: hospitalWide });

describe('canManageLeave', () => {
  it('needs a hospital-wide hr manager who owns hr data', () => {
    expect(canManageLeave(subject([{ name: 'hr-manager', organizationId: null }], ['hr']))).toBe(true);
    expect(canManageLeave(subject([{ name: 'hr-manager', organizationId: null }], []))).toBe(false);
    expect(canManageLeave(subject([{ name: 'hr-manager', organizationId: 'unit-a' }], ['hr']))).toBe(false);
    expect(canManageLeave(subject([{ name: 'staff', organizationId: null }], ['hr']))).toBe(false);
  });
});
