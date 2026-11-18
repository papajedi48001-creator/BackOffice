import { describe, expect, it } from 'vitest';
import { permissionModules } from './access.ts';
import { grantableRoleSchema, testerModuleCodes } from './admin.ts';
import { hosxpCodeSchema, PTTYPE_MAPPING_MODULE, pttypeMappingInputSchema } from './pttype-mapping.ts';

describe('pttype-mapping module wiring', () => {
  it('maps pttype-mapping.manage to the module and adds the manager and tester roles', () => {
    expect(PTTYPE_MAPPING_MODULE).toBe('pttype-mapping');
    expect(permissionModules['pttype-mapping.manage']).toBe('pttype-mapping');
    expect(grantableRoleSchema.safeParse('pttype-mapping-manager').success).toBe(true);
    expect(grantableRoleSchema.safeParse('pttype-mapping-tester').success).toBe(true);
    expect(testerModuleCodes).toContain('pttype-mapping');
  });
});

describe('hosxpCodeSchema', () => {
  it('accepts HOSxP codes', () => {
    for (const code of ['10', 'A7', '1102050101.301', 'UC_1-2']) expect(hosxpCodeSchema.safeParse(code).success).toBe(true);
  });
  it('rejects empty, spaced, quoted and over-long codes', () => {
    for (const code of ['', 'x y', "1'", 'a'.repeat(21)]) expect(hosxpCodeSchema.safeParse(code).success).toBe(false);
  });
});

describe('pttypeMappingInputSchema', () => {
  const valid = { opd: '1102050101.301', ipd: null, expected: { opd: null, ipd: null } };
  it('accepts a code or null for each side with the values the person saw', () => {
    expect(pttypeMappingInputSchema.safeParse(valid).success).toBe(true);
  });
  it('rejects a bad code, a missing expected and an extra key', () => {
    expect(pttypeMappingInputSchema.safeParse({ ...valid, opd: 'x y' }).success).toBe(false);
    expect(pttypeMappingInputSchema.safeParse({ opd: null, ipd: null }).success).toBe(false);
    expect(pttypeMappingInputSchema.safeParse({ ...valid, year: 2017 }).success).toBe(false);
  });
});
