import type { AccessSubject } from '@backoffice/contracts';
import { describe, expect, it } from 'vitest';
import { moduleRegistry, navigationFor, visibleModules } from './modules';

const subject = (overrides: Partial<AccessSubject> = {}): AccessSubject => ({ authenticated: true, personId: 'p', roles: [], dataOwnerModules: [], ...overrides });
const hrefs = (value: AccessSubject) => navigationFor(value).map((item) => item.href);

describe('module registry', () => {
  it('has unique codes and hrefs', () => {
    expect(new Set(moduleRegistry.map((entry) => entry.code)).size).toBe(moduleRegistry.length);
    expect(new Set(moduleRegistry.map((entry) => entry.href)).size).toBe(moduleRegistry.length);
  });

  it('shows no HR or access modules to a user without roles', () => {
    expect(hrefs(subject())).toEqual(['/dashboard', '/requests', '/notifications', '/audit']);
  });

  it('shows people and units to hr-reader', () => {
    const result = hrefs(subject({ roles: [{ name: 'hr-reader', organizationId: 'unit-1' }] }));
    expect(result).toEqual(expect.arrayContaining(['/hr/people', '/hr/organizations']));
    expect(result).not.toContain('/hr/imports');
    expect(result).not.toContain('/access/roles');
  });

  it('shows import only to hospital-wide hr-manager data owners', () => {
    expect(hrefs(subject({ roles: [{ name: 'hr-manager', organizationId: null }], dataOwnerModules: ['hr'], hospitalWideDataOwnerModules: ['hr'] }))).toContain('/hr/imports');
    const scoped = hrefs(subject({ roles: [{ name: 'hr-manager', organizationId: 'unit-1' }], dataOwnerModules: ['hr'], hospitalWideDataOwnerModules: [] }));
    expect(scoped).not.toContain('/hr/imports');
    expect(scoped).toEqual(expect.arrayContaining(['/access/roles', '/access/delegations']));
  });

  it('never puts planned modules in navigation but lists them in visibleModules', () => {
    expect(hrefs(subject())).not.toContain('/rooms');
    expect(visibleModules(subject()).find((entry) => entry.code === 'room-booking')?.status).toBe('planned');
  });
});
