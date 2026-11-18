import { describe, expect, it } from 'vitest';
import type { AccessSubject } from '@backoffice/contracts';
import { canManagePttypeMapping } from './pttype-mapping-access';

const subject = (roles: string[]): AccessSubject => ({ authenticated: true, personId: 'p1', roles: roles.map((name) => ({ name, organizationId: null })), dataOwnerModules: [], hospitalWideDataOwnerModules: [] });

describe('Mapping สิทธิ access', () => {
  it('lets only ผู้ดูแลระบบ and ผู้จัดการโมดูล Mapping สิทธิ in', () => {
    expect(canManagePttypeMapping(subject(['admin']))).toBe(true);
    expect(canManagePttypeMapping(subject(['pttype-mapping-manager']))).toBe(true);
    expect(canManagePttypeMapping(subject(['money-manager']))).toBe(false);
    expect(canManagePttypeMapping(subject(['pttype-mapping-tester']))).toBe(false);
    expect(canManagePttypeMapping(subject([]))).toBe(false);
  });
});
