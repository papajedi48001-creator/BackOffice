import { describe, expect, it } from 'vitest';
import type { AccessSubject } from '@backoffice/contracts';
import { canManageMoney, moneyCan, moneyVisiblePages } from './money-access';

const subject = (roles: string[]): AccessSubject => ({ authenticated: true, personId: 'p1', roles: roles.map((name) => ({ name, organizationId: null })), dataOwnerModules: [], hospitalWideDataOwnerModules: [] });

describe('Smart Money access', () => {
  it('treats ผู้ดูแลระบบ and ผู้จัดการโมดูล Smart Money as managers, nobody else', () => {
    expect(canManageMoney(subject(['admin']))).toBe(true);
    expect(canManageMoney(subject(['money-manager']))).toBe(true);
    expect(canManageMoney(subject(['lab-manager']))).toBe(false);
    expect(canManageMoney(subject([]))).toBe(false);
  });

  it('lets a manager open every page and manage', () => {
    expect(moneyCan(null, true, 'dental')).toBe(true);
    expect(moneyCan(null, true, 'manage')).toBe(true);
    expect(moneyVisiblePages(null, true)).toEqual(['dental']);
  });

  it('lets a member open only their pages and never manage', () => {
    const member = { pages: ['dental' as const] };
    expect(moneyCan(member, false, 'dental')).toBe(true);
    expect(moneyCan(member, false, 'manage')).toBe(false);
    expect(moneyCan({ pages: [] }, false, 'dental')).toBe(false);
    expect(moneyVisiblePages(member, false)).toEqual(['dental']);
  });

  it('refuses a non-member', () => {
    expect(moneyCan(null, false, 'dental')).toBe(false);
    expect(moneyVisiblePages(null, false)).toEqual([]);
  });
});
