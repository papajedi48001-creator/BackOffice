import type { AccessSubject } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { describe, expect, it, vi } from 'vitest';
import { moduleLabel, moduleRegistry, moduleSections, navigationFor, visibleModules } from './modules';

const subject = (overrides: Partial<AccessSubject> = {}): AccessSubject => ({ authenticated: true, personId: 'p', roles: [], dataOwnerModules: [], ...overrides });
const hrefs = (value: AccessSubject) => navigationFor(value).map((item) => item.href);
const sectionHrefs = (code: string, value: AccessSubject) => moduleSections(code, value).map((section) => section.href);

describe('module registry', () => {
  it('has unique codes and hrefs', () => {
    expect(new Set(moduleRegistry.map((entry) => entry.code)).size).toBe(moduleRegistry.length);
    expect(new Set(moduleRegistry.map((entry) => entry.href)).size).toBe(moduleRegistry.length);
  });

  it('shows one entry per module and only their own profile under HR to a user without roles', () => {
    expect(hrefs(subject())).toEqual(['/dashboard', '/requests', '/notifications', '/hr', '/access', '/rooms']);
    expect(sectionHrefs('access', subject())).toEqual(['/access/audit']);
    expect(sectionHrefs('hr', subject())).toEqual(['/hr/me']);
  });

  it('gives hr-reader the HR module with people and units only', () => {
    const reader = subject({ roles: [{ name: 'hr-reader', organizationId: 'unit-1' }] });
    expect(hrefs(reader)).toContain('/hr');
    expect(hrefs(reader).filter((href) => href.startsWith('/hr/'))).toEqual([]);
    expect(sectionHrefs('hr', reader)).toEqual(['/hr/people', '/hr/organizations', '/hr/me']);
    expect(sectionHrefs('access', reader)).toEqual(['/access/audit']);
  });

  it('shows import only to hospital-wide hr-manager data owners', () => {
    expect(sectionHrefs('hr', subject({ roles: [{ name: 'hr-manager', organizationId: null }], dataOwnerModules: ['hr'], hospitalWideDataOwnerModules: ['hr'] }))).toContain('/hr/imports');
    const scoped = subject({ roles: [{ name: 'hr-manager', organizationId: 'unit-1' }], dataOwnerModules: ['hr'], hospitalWideDataOwnerModules: [] });
    expect(sectionHrefs('hr', scoped)).not.toContain('/hr/imports');
    expect(sectionHrefs('hr', scoped)).not.toContain('/hr/employment-types');
    expect(sectionHrefs('hr', subject({ roles: [{ name: 'hr-manager', organizationId: null }], dataOwnerModules: ['hr'], hospitalWideDataOwnerModules: ['hr'] }))).toContain('/hr/employment-types');
    expect(sectionHrefs('access', scoped)).toEqual(['/access/roles', '/access/delegations', '/access/audit']);
  });

  it('keeps every section inside its module path', () => {
    for (const entry of moduleRegistry) for (const section of entry.sections ?? []) expect(section.href.startsWith(`${entry.href}/`)).toBe(true);
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

describe('moduleLabel', () => {
  it('names the module that sent a notification', () => {
    expect(moduleLabel('room-booking')).toBe('จองห้องประชุม');
    expect(moduleLabel('requests')).toBe('คำขอ');
  });

  it('treats older notifications without a module as requests', () => {
    expect(moduleLabel(null)).toBe('คำขอ');
  });

  it('falls back to the system name for an unknown module', () => {
    expect(moduleLabel('not-registered')).toBe('ระบบ Back Office');
  });
});
