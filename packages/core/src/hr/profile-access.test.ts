import { describe, expect, it } from 'vitest';
import type { AccessSubject } from '@backoffice/contracts';
import { canManageEmploymentTypes, profileAccess } from './profile-access';

const subject = (roles: AccessSubject['roles'], dataOwnerModules: string[] = [], personId = 'viewer'): AccessSubject => ({ authenticated: true, personId, roles, dataOwnerModules, hospitalWideDataOwnerModules: dataOwnerModules });
const target = { personId: 'person-1', organizationId: 'unit-a' };

describe('profileAccess', () => {
  it('lets a person without roles see their own profile and edit only their contact details', () => {
    expect(profileAccess(subject([], [], 'person-1'), target)).toEqual({ viewWork: true, viewPrivate: true, editProfile: false, editContact: true });
  });

  it('shows work details only to a reader whose scope covers the unit', () => {
    expect(profileAccess(subject([{ name: 'hr-reader', organizationId: 'unit-a' }]), target)).toEqual({ viewWork: true, viewPrivate: false, editProfile: false, editContact: false });
    expect(profileAccess(subject([{ name: 'hr-reader', organizationId: 'unit-b' }]), target)).toEqual({ viewWork: false, viewPrivate: false, editProfile: false, editContact: false });
  });

  it('gives an hr manager who owns hr data everything, and without ownership work details only', () => {
    expect(profileAccess(subject([{ name: 'hr-manager', organizationId: null }], ['hr']), target)).toEqual({ viewWork: true, viewPrivate: true, editProfile: true, editContact: true });
    expect(profileAccess(subject([{ name: 'hr-manager', organizationId: null }]), target)).toEqual({ viewWork: true, viewPrivate: false, editProfile: false, editContact: false });
  });

  it('lets only a hospital-wide reader see a person with no unit', () => {
    const unassigned = { personId: 'person-1', organizationId: null };
    expect(profileAccess(subject([{ name: 'hr-reader', organizationId: null }]), unassigned).viewWork).toBe(true);
    expect(profileAccess(subject([{ name: 'hr-reader', organizationId: 'unit-a' }]), unassigned).viewWork).toBe(false);
  });

  it('grants nothing to an anonymous subject', () => {
    expect(profileAccess({ authenticated: false, personId: 'person-1', roles: [], dataOwnerModules: [] }, target)).toEqual({ viewWork: false, viewPrivate: false, editProfile: false, editContact: false });
  });

  it('lets only a hospital-wide hr manager who owns hr data manage employment types', () => {
    expect(canManageEmploymentTypes(subject([{ name: 'hr-manager', organizationId: null }], ['hr']))).toBe(true);
    expect(canManageEmploymentTypes(subject([{ name: 'hr-manager', organizationId: 'unit-a' }], ['hr']))).toBe(false);
    expect(canManageEmploymentTypes(subject([{ name: 'hr-reader', organizationId: null }], ['hr']))).toBe(false);
  });
});
