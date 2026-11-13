import { describe, expect, it } from 'vitest';
import { gateDecision, moduleForPath } from './module-gate';

describe('module gate', () => {
  it('finds the module of a page or an API path', () => {
    expect(moduleForPath('/leave/mine')).toBe('leave');
    expect(moduleForPath('/api/leave/settings')).toBe('leave');
    expect(moduleForPath('/mci/board')).toBe('mass-casualty');
    expect(moduleForPath('/api/mci/board')).toBe('mass-casualty');
    expect(moduleForPath('/lab/stock')).toBe('lab-inventory');
    expect(moduleForPath('/api/lab/usages')).toBe('lab-inventory');
    expect(moduleForPath('/money/dental')).toBe('smart-money');
    expect(moduleForPath('/api/money/members')).toBe('smart-money');
    expect(moduleForPath('/rooms')).toBe('room-booking');
    expect(moduleForPath('/api/rooms/bookings/x')).toBe('room-booking');
    expect(moduleForPath('/api/travel')).toBe('official-travel');
    expect(moduleForPath('/leaves')).toBeNull();
    expect(moduleForPath('/dashboard')).toBeNull();
    expect(moduleForPath('/api/auth/local')).toBeNull();
    expect(moduleForPath('/api/attachments/x/download')).toBeNull();
  });

  const nobody = async () => null;
  const person = (...roles: string[]) => async () => ({ authenticated: true, personId: 'p-1', roles: roles.map((name) => ({ name, organizationId: null })), dataOwnerModules: [] });

  it('refuses pages and APIs of an OFF module to everyone, and nothing else', async () => {
    const off = { fleet: 'OFF' } as const;
    await expect(gateDecision('/fleet/settings', off, nobody)).resolves.toEqual({ moduleCode: 'fleet', api: false });
    await expect(gateDecision('/api/fleet/drivers', off, person('admin'))).resolves.toEqual({ moduleCode: 'fleet', api: true });
    await expect(gateDecision('/leave/mine', off, nobody)).resolves.toBeNull();
    await expect(gateDecision('/dashboard', off, nobody)).resolves.toBeNull();
  });

  it('lets only ผู้ดูแลระบบ, ผู้จัดการ and ผู้ทดสอบ into a DEVELOPMENT module', async () => {
    const dev = { fleet: 'DEVELOPMENT' } as const;
    await expect(gateDecision('/fleet/mine', dev, nobody)).resolves.toEqual({ moduleCode: 'fleet', api: false });
    await expect(gateDecision('/api/fleet/requests', dev, person('leave-tester'))).resolves.toEqual({ moduleCode: 'fleet', api: true });
    for (const role of ['admin', 'fleet-manager', 'fleet-tester']) await expect(gateDecision('/fleet/mine', dev, person(role))).resolves.toBeNull();
  });

  it('never refuses the admin module, so it can always switch others back on', async () => {
    await expect(gateDecision('/admin/modules', { admin: 'OFF' }, nobody)).resolves.toBeNull();
    await expect(gateDecision('/api/admin/modules/fleet', { admin: 'DEVELOPMENT' }, nobody)).resolves.toBeNull();
  });
});
