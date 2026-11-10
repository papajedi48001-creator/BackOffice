import { describe, expect, it } from 'vitest';
import { canManageLab, labCan, type LabAction, type LabMember } from './lab-access';

const head: LabMember = { role: 'HEAD', sectionIds: [] };
const keeper: LabMember = { role: 'KEEPER', sectionIds: [] };
const staff: LabMember = { role: 'STAFF', sectionIds: ['chem'] };
const all: LabAction[] = ['manageMembers', 'manageSettings', 'editOpening', 'certifyOpening', 'receive', 'request', 'decide', 'issue', 'use', 'reverseAnyUse', 'viewStock'];
const allowed = (member: LabMember, manages = false, sectionId: string | null = 'chem') => all.filter((action) => labCan(member, manages, action, sectionId));

describe('labCan (spec permission table)', () => {
  it('lets a lab.manage holder do everything, member or not', () => {
    expect(allowed(null, true)).toEqual(all);
  });
  it('gives หัวหน้า Lab certify, decide, request, use and stock views', () => {
    expect(allowed(head)).toEqual(['certifyOpening', 'request', 'decide', 'use', 'viewStock']);
  });
  it('gives ผู้ดูแลคลัง Lab settings, opening, receive, issue, request, use, reversal and stock views', () => {
    expect(allowed(keeper)).toEqual(['manageSettings', 'editOpening', 'receive', 'request', 'issue', 'use', 'reverseAnyUse', 'viewStock']);
  });
  it('keeps เจ้าหน้าที่ Lab to request, use and view stock in their own section', () => {
    expect(allowed(staff, false, 'chem')).toEqual(['request', 'use', 'viewStock']);
    expect(allowed(staff, false, 'hema')).toEqual([]);
    expect(allowed(staff, false, null)).toEqual([]);
  });
  it('gives a non-member nothing', () => {
    expect(allowed(null)).toEqual([]);
  });
});

describe('canManageLab', () => {
  const subject = (name: string, organizationId: string | null = null) => ({ authenticated: true, personId: 'p', roles: [{ name, organizationId }], dataOwnerModules: [], hospitalWideDataOwnerModules: [] });
  it('is true for ผู้ดูแลระบบ and an unscoped lab-manager only', () => {
    expect(canManageLab(subject('admin'))).toBe(true);
    expect(canManageLab(subject('lab-manager'))).toBe(true);
    expect(canManageLab(subject('lab-manager', 'unit-a'))).toBe(false);
    expect(canManageLab(subject('fleet-manager'))).toBe(false);
  });
});
