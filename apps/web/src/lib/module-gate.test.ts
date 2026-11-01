import { describe, expect, it } from 'vitest';
import { gateDecision, moduleForPath } from './module-gate';

describe('module gate', () => {
  it('finds the module of a page or an API path', () => {
    expect(moduleForPath('/leave/mine')).toBe('leave');
    expect(moduleForPath('/api/leave/settings')).toBe('leave');
    expect(moduleForPath('/rooms')).toBe('room-booking');
    expect(moduleForPath('/api/rooms/bookings/x')).toBe('room-booking');
    expect(moduleForPath('/api/travel')).toBe('official-travel');
    expect(moduleForPath('/leaves')).toBeNull();
    expect(moduleForPath('/dashboard')).toBeNull();
    expect(moduleForPath('/api/auth/local')).toBeNull();
    expect(moduleForPath('/api/attachments/x/download')).toBeNull();
  });

  it('refuses pages and APIs of a disabled module, and nothing else', () => {
    expect(gateDecision('/fleet/settings', ['fleet'])).toEqual({ moduleCode: 'fleet', api: false });
    expect(gateDecision('/api/fleet/drivers', ['fleet'])).toEqual({ moduleCode: 'fleet', api: true });
    expect(gateDecision('/leave/mine', ['fleet'])).toBeNull();
    expect(gateDecision('/dashboard', ['fleet'])).toBeNull();
  });

  it('never refuses the admin module, so it can always switch others back on', () => {
    expect(gateDecision('/admin/modules', ['admin'])).toBeNull();
    expect(gateDecision('/api/admin/modules/fleet', ['admin'])).toBeNull();
  });
});
