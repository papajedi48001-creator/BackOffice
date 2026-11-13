import { describe, expect, it } from 'vitest';
import { permissionModules } from './access.ts';
import { grantableRoleSchema, testerModuleCodes } from './admin.ts';
import { dentalGroupSchema, dentalPeriodSchema, MONEY_MODULE, moneyMemberInputSchema, moneyPageSchema } from './smart-money.ts';

const uuid = '0b6f3c1e-5d1a-4c8e-9a51-2f7c1d9e8b10';

describe('smart-money module wiring', () => {
  it('maps money.manage to the module and adds the manager and tester roles', () => {
    expect(MONEY_MODULE).toBe('smart-money');
    expect(permissionModules['money.manage']).toBe('smart-money');
    expect(grantableRoleSchema.safeParse('money-manager').success).toBe(true);
    expect(grantableRoleSchema.safeParse('smart-money-tester').success).toBe(true);
    expect(testerModuleCodes).toContain('smart-money');
  });
});

describe('moneyMemberInputSchema', () => {
  it('accepts a person with at least one page', () => {
    expect(moneyMemberInputSchema.safeParse({ personId: uuid, pages: ['dental'] }).success).toBe(true);
  });
  it('rejects a member with no page', () => {
    expect(moneyMemberInputSchema.safeParse({ personId: uuid, pages: [] }).success).toBe(false);
  });
  it('rejects an unknown page', () => {
    expect(moneyMemberInputSchema.safeParse({ personId: uuid, pages: ['x'] }).success).toBe(false);
  });
  it('rejects an extra key', () => {
    expect(moneyMemberInputSchema.safeParse({ personId: uuid, pages: ['dental'], role: 'HEAD' }).success).toBe(false);
  });
});

describe('dental filter enums', () => {
  it('lists the pages, groups and periods', () => {
    expect(moneyPageSchema.options).toEqual(['dental']);
    expect(dentalGroupSchema.options).toEqual(['pttype', 'paccount']);
    expect(dentalPeriodSchema.options).toEqual(['day', 'month']);
  });
});
