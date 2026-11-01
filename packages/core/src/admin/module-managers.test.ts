import { describe, expect, it } from 'vitest';
import type { AccessSubject } from '@backoffice/contracts';
import { grantableRoleSchema, testerModuleCodes } from '@backoffice/contracts';
import { canUseModule, moduleTesterRoles, modulesTestedBy } from './module-managers';

const subject = (...roles: string[]): AccessSubject => ({ authenticated: true, personId: 'p-1', roles: roles.map((name) => ({ name, organizationId: null })), dataOwnerModules: [] }) as AccessSubject;

describe('module modes', () => {
  it('lets everyone into an ON module and nobody into an OFF one, admins included', () => {
    expect(canUseModule(subject(), 'fleet', 'ON')).toBe(true);
    expect(canUseModule(subject('admin'), 'fleet', 'OFF')).toBe(false);
  });

  it('keeps a DEVELOPMENT module for admins, its managers and its testers', () => {
    expect(canUseModule(subject(), 'fleet', 'DEVELOPMENT')).toBe(false);
    expect(canUseModule(subject('admin'), 'fleet', 'DEVELOPMENT')).toBe(true);
    expect(canUseModule(subject('fleet-manager'), 'fleet', 'DEVELOPMENT')).toBe(true);
    expect(canUseModule(subject('fleet-tester'), 'fleet', 'DEVELOPMENT')).toBe(true);
    expect(canUseModule(subject('leave-tester', 'leave-manager'), 'fleet', 'DEVELOPMENT')).toBe(false);
    expect(canUseModule(subject('requests-tester'), 'requests', 'DEVELOPMENT')).toBe(true);
  });

  it('never closes the admin module', () => {
    expect(canUseModule(subject('admin'), 'admin', 'OFF')).toBe(true);
  });

  it('a unit-scoped tester assignment does not open a module in development', () => {
    const scoped = { ...subject(), roles: [{ name: 'fleet-tester', organizationId: 'org-1' }] } as AccessSubject;
    expect(canUseModule(scoped, 'fleet', 'DEVELOPMENT')).toBe(false);
  });
});

describe('tester roles', () => {
  it('names one <module>-tester role per testable module, all grantable', () => {
    expect(moduleTesterRoles.fleet).toBe('fleet-tester');
    expect(moduleTesterRoles['official-travel']).toBe('official-travel-tester');
    expect(moduleTesterRoles.admin).toBeUndefined();
    for (const code of testerModuleCodes) expect(grantableRoleSchema.safeParse(`${code}-tester`).success).toBe(true);
    expect(modulesTestedBy('room-booking-tester')).toEqual(['room-booking']);
  });
});
