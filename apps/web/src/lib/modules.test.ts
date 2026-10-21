import type { AccessSubject } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { describe, expect, it, vi } from 'vitest';
import { moduleRegistry, navigationFor, visibleModules } from './modules';

const subject = (overrides: Partial<AccessSubject> = {}): AccessSubject => ({ authenticated: true, personId: 'p', roles: [], dataOwnerModules: [], ...overrides });
const hrefs = (value: AccessSubject) => navigationFor(value).map((item) => item.href);

describe('module registry', () => {
  it('has unique codes and hrefs', () => {
    expect(new Set(moduleRegistry.map((entry) => entry.code)).size).toBe(moduleRegistry.length);
    expect(new Set(moduleRegistry.map((entry) => entry.href)).size).toBe(moduleRegistry.length);
  });

  it('shows no HR or access modules to a user without roles', () => {
    expect(hrefs(subject())).toEqual(['/dashboard', '/requests', '/notifications', '/audit', '/rooms']);
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
    expect(hrefs(subject())).not.toContain('/maintenance');
    expect(visibleModules(subject()).find((entry) => entry.code === 'maintenance')?.status).toBe('planned');
  });

  it('puts room booking in everyone\'s navigation', () => {
    expect(hrefs(subject())).toContain('/rooms');
    expect(visibleModules(subject()).find((entry) => entry.code === 'room-booking')).toMatchObject({ status: 'live', group: 'services' });
  });

  it('badges room booking with pending bookings only for approvers', async () => {
    const roomBooking = moduleRegistry.find((entry) => entry.code === 'room-booking')!;
    const row = { id: 'b1', reference: 'RB-2569-0001', roomName: 'ห้อง 1', title: 'ประชุม', status: 'PENDING', startMinute: 540, endMinute: 720, firstDate: '2026-11-05', lastDate: '2026-11-05', activeDayCount: 1, lastEndsAt: '2026-11-05 05:00:00', bookerName: null, bookerOrganizationName: null };
    const query = vi.fn().mockResolvedValue([row, { ...row, id: 'b2' }]);
    const database = { query } as unknown as Database;
    expect(await roomBooking.badge!(database, subject())).toBe(0);
    expect(query).not.toHaveBeenCalled();
    expect(await roomBooking.badge!(database, subject({ roles: [{ name: 'room-booking-approver', organizationId: null }] }))).toBe(2);
  });
});
