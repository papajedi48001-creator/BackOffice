import type { AccessSubject } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { describe, expect, it, vi } from 'vitest';
import { availableModules, moduleCodeForPath, moduleLabel, moduleRegistry, moduleSections, navigationFor, navigationFrom, visibleModules } from './modules';

const subject = (overrides: Partial<AccessSubject> = {}): AccessSubject => ({ authenticated: true, personId: 'p', roles: [], dataOwnerModules: [], ...overrides });
const hrefs = (value: AccessSubject) => navigationFor(value).map((item) => item.href);
const sectionHrefs = (code: string, value: AccessSubject) => moduleSections(code, value).map((section) => section.href);

describe('module registry', () => {
  it('has unique codes and hrefs', () => {
    expect(new Set(moduleRegistry.map((entry) => entry.code)).size).toBe(moduleRegistry.length);
    expect(new Set(moduleRegistry.map((entry) => entry.href)).size).toBe(moduleRegistry.length);
  });

  it('shows one entry per module and only their own profile under HR to a user without roles', () => {
    expect(hrefs(subject())).toEqual(['/dashboard', '/requests', '/notifications', '/hr', '/access', '/rooms', '/leave', '/travel', '/fleet']);
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
    expect(sectionHrefs('hr', scoped)).not.toContain('/hr/positions');
    expect(sectionHrefs('hr', subject({ roles: [{ name: 'hr-manager', organizationId: null }], dataOwnerModules: ['hr'], hospitalWideDataOwnerModules: ['hr'] }))).toContain('/hr/positions');
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

describe('requests and notifications', () => {
  it('badges คำขอ with the requests waiting on the person, and การแจ้งเตือน with unread notices', async () => {
    const requests = moduleRegistry.find((entry) => entry.code === 'requests')!;
    const notifications = moduleRegistry.find((entry) => entry.code === 'notifications')!;
    expect(await requests.badge!({ query: vi.fn().mockResolvedValue([{ requestId: 'r1', moduleCode: 'leave' }, { requestId: 'r2', moduleCode: 'requests' }]) } as unknown as Database, subject())).toBe(2);
    expect(await notifications.badge!({ query: vi.fn().mockResolvedValue([{ total: 3 }]) } as unknown as Database, subject())).toBe(3);
    expect(await requests.badge!({ query: vi.fn() } as unknown as Database, subject({ personId: null }))).toBe(0);
  });

  it('leaves out คำขอ for someone who never made or was asked to approve a request', async () => {
    const codes = async (found: number) => (await availableModules(visibleModules(subject()), { query: vi.fn().mockResolvedValue([{ found }]) } as unknown as Database, subject())).map((entry) => entry.code);
    expect(await codes(0)).not.toContain('requests');
    expect(await codes(1)).toContain('requests');
  });

  it('keeps คำขอ when the check fails, since the page still guards itself', async () => {
    const modules = await availableModules(visibleModules(subject()), { query: vi.fn().mockRejectedValue(new Error('down')) } as unknown as Database, subject());
    expect(modules.map((entry) => entry.code)).toContain('requests');
  });

  it('puts each module\'s count on its menu item', () => {
    const items = navigationFrom(visibleModules(subject()), { leave: 2, requests: 0 });
    expect(items.find((item) => item.href === '/leave')?.badge).toBe(2);
    expect(items.find((item) => item.href === '/requests')?.badge).toBe(0);
    expect(items[0]).toEqual({ href: '/dashboard', label: 'dashboard', module: 'home' });
  });
});

describe('official travel module', () => {
  const manager = subject({ roles: [{ name: 'hr-manager', organizationId: null }], dataOwnerModules: ['hr'], hospitalWideDataOwnerModules: ['hr'] });

  it('is live in the mine group with HR sections only for travel.manage', () => {
    expect(moduleRegistry.find((entry) => entry.code === 'official-travel')).toMatchObject({ status: 'live', group: 'mine', href: '/travel', labelKey: 'moduleTravel' });
    expect(sectionHrefs('official-travel', subject())).toEqual(['/travel/mine', '/travel/new', '/travel/approvals']);
    expect(sectionHrefs('official-travel', manager)).toEqual(['/travel/mine', '/travel/new', '/travel/approvals', '/travel/all', '/travel/settings']);
  });
});

describe('fleet module', () => {
  const manager = subject({ roles: [{ name: 'fleet-manager', organizationId: null }] });
  const waitingRow = { id: 'f1', dispatchStatus: 'WAITING', headStatus: null, tripStatus: null };
  /** Three ใบ รอจัดรถ and two of the person's เที่ยวรถ today. */
  const database = () => ({ query: vi.fn(async (sql: string) => sql.startsWith('SELECT COUNT(*) AS count FROM fleet_trip') ? [{ count: 2 }] : [waitingRow, { ...waitingRow, id: 'f2' }, { ...waitingRow, id: 'f3' }]) }) as unknown as Database;

  it('is live in the services group, opening on my ใบ for everyone and on the dashboard for the หัวหน้าหมวด', () => {
    expect(moduleRegistry.find((entry) => entry.code === 'fleet')).toMatchObject({ status: 'live', group: 'services', href: '/fleet', labelKey: 'moduleFleet', icon: 'car' });
    // Whether someone drives comes from fleet_driver, which the synchronous section check cannot read: the link shows to everyone and the page says who it is for.
    expect(sectionHrefs('fleet', subject())).toEqual(['/fleet/mine', '/fleet/calendar', '/fleet/driving']);
    expect(sectionHrefs('fleet', manager)).toEqual(['/fleet/dashboard', '/fleet/mine', '/fleet/calendar', '/fleet/driving', '/fleet/settings']);
    expect(sectionHrefs('fleet', subject({ roles: [{ name: 'fleet-manager', organizationId: 'unit-1' }] }))).not.toContain('/fleet/dashboard');
    expect(moduleCodeForPath('/fleet/requests/1')).toBe('fleet');
  });

  it('badges รอจัดรถ for the หัวหน้าหมวด and today\'s เที่ยวรถ for a driver, summed on the module', async () => {
    const fleet = moduleRegistry.find((entry) => entry.code === 'fleet')!;
    expect(await fleet.badge!(database(), manager)).toBe(5);
    expect(await fleet.badge!(database(), subject())).toBe(2);
    expect(await fleet.badge!(database(), subject({ personId: null }))).toBe(0);
    const section = (href: string) => fleet.sections!.find((entry) => entry.href === href)!;
    expect(await section('/fleet/dashboard').badge!(database(), manager)).toBe(3);
    expect(await section('/fleet/driving').badge!(database(), subject())).toBe(2);
  });
});

describe('leave module', () => {
  const manager = subject({ roles: [{ name: 'hr-manager', organizationId: null }], dataOwnerModules: ['hr'], hospitalWideDataOwnerModules: ['hr'] });

  it('is live in the mine group with staff sections first and HR sections after', () => {
    expect(moduleRegistry.find((entry) => entry.code === 'leave')).toMatchObject({ status: 'live', group: 'mine', href: '/leave' });
    expect(sectionHrefs('leave', subject())).toEqual(['/leave/mine', '/leave/new', '/leave/approvals', '/leave/calendar']);
    expect(sectionHrefs('leave', manager)).toEqual(['/leave/mine', '/leave/new', '/leave/approvals', '/leave/calendar', '/leave/all', '/leave/settings', '/leave/holidays', '/leave/balances']);
  });

  it('counts the ใบลา waiting on the person on the อนุมัติการลา section', async () => {
    const approvals = moduleRegistry.find((entry) => entry.code === 'leave')!.sections!.find((section) => section.href === '/leave/approvals')!;
    const query = vi.fn().mockResolvedValue([{ requestId: 'r1' }]);
    expect(await approvals.badge!({ query } as unknown as Database, subject())).toBe(1);
  });

  it('badges the ใบลา waiting on the person', async () => {
    const leave = moduleRegistry.find((entry) => entry.code === 'leave')!;
    const query = vi.fn().mockResolvedValue([{ requestId: 'r1' }, { requestId: 'r2' }]);
    expect(await leave.badge!({ query } as unknown as Database, subject())).toBe(2);
    expect(await leave.badge!({ query } as unknown as Database, subject({ personId: null }))).toBe(0);
  });
});

describe('moduleLabel', () => {
  it('labels leave notifications', () => {
    expect(moduleLabel('leave')).toBe('การลา');
  });

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

  it('opens inventory to hospital-wide supplies roles only, with sections by role', () => {
    const officer = subject({ roles: [{ name: 'inventory-officer', organizationId: null }] });
    const supervisor = subject({ roles: [{ name: 'inventory-supervisor', organizationId: null }] });
    expect(sectionHrefs('inventory', officer)).toEqual(['/inventory/stock', '/inventory/receipts', '/inventory/opening', '/inventory/items', '/inventory/vendors']);
    expect(sectionHrefs('inventory', supervisor)).toEqual(['/inventory/stock', '/inventory/opening']);
    expect(hrefs(officer)).toContain('/inventory');
    expect(hrefs(subject())).not.toContain('/inventory');
    expect(hrefs(subject({ roles: [{ name: 'inventory-officer', organizationId: 'ward-1' }] }))).not.toContain('/inventory');
  });
});

describe('moduleCodeForPath', () => {
  it('finds the module a page belongs to', () => {
    expect(moduleCodeForPath('/hr/people/1')).toBe('hr');
    expect(moduleCodeForPath('/rooms/bookings/new')).toBe('room-booking');
    expect(moduleCodeForPath('/leave')).toBe('leave');
  });

  it('treats the main page and unknown paths as home', () => {
    expect(moduleCodeForPath('/dashboard')).toBe('home');
    expect(moduleCodeForPath('/')).toBe('home');
    expect(moduleCodeForPath('/hrx')).toBe('home');
  });

  it('tags each navigation item with its module', () => {
    const items = navigationFor(subject());
    expect(items[0]).toMatchObject({ href: '/dashboard', module: 'home' });
    expect(items.find((item) => item.href === '/rooms')).toMatchObject({ module: 'room-booking' });
  });
});
