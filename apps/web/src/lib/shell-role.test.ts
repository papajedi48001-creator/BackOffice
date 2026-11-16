import { describe, expect, it } from 'vitest';
import { shellRole } from './shell-role';

const base = { authenticated: true as const, personId: 'p1', roles: [], dataOwnerModules: [] };

describe('shellRole', () => {
  it('offers เปลี่ยนบทบาท to a person with a single tier, so they can switch to บุคลากรทั่วไป', () => {
    expect(shellRole({ ...base, activeRole: 'manager', roleChoices: ['manager'] })).toEqual({ name: 'ผู้จัดการ', canSwitch: true });
    expect(shellRole({ ...base, activeRole: 'employee', roleChoices: ['admin'] })).toEqual({ name: 'บุคลากรทั่วไป', canSwitch: true });
  });

  it('offers it with both tiers and shows nothing for a person with no role', () => {
    expect(shellRole({ ...base, activeRole: 'admin', roleChoices: ['admin', 'manager'] })).toEqual({ name: 'ผู้ดูแลระบบ', canSwitch: true });
    expect(shellRole({ ...base, activeRole: 'employee', roleChoices: [] })).toBeNull();
  });
});
