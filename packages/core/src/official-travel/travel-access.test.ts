import { describe, expect, it } from 'vitest';
import { canManageTravel } from './travel-access';

const subject = (roles: Array<{ name: string; organizationId: string | null }>, hospitalWide: string[]) => ({ authenticated: true, personId: 'person-a', roles, dataOwnerModules: hospitalWide, hospitalWideDataOwnerModules: hospitalWide });

describe('canManageTravel', () => {
  it('needs a hospital-wide hr manager who owns hr data', () => {
    expect(canManageTravel(subject([{ name: 'hr-manager', organizationId: null }], ['hr']))).toBe(true);
    expect(canManageTravel(subject([{ name: 'hr-manager', organizationId: null }], []))).toBe(false);
    expect(canManageTravel(subject([{ name: 'hr-manager', organizationId: 'unit-a' }], ['hr']))).toBe(false);
    expect(canManageTravel(subject([{ name: 'staff', organizationId: null }], ['hr']))).toBe(false);
  });
});
