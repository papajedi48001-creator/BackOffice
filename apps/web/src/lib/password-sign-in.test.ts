import { describe, expect, it } from 'vitest';
import { passwordSignInOpen, passwordSignInState } from './password-sign-in';

describe('passwordSignInOpen', () => {
  it('is open when no external route is ready, so the first ผู้ดูแลระบบ can sign in', () => {
    expect(passwordSignInOpen({ externalRouteReady: false, override: undefined })).toBe(true);
  });

  it('is closed once an external route is ready', () => {
    expect(passwordSignInOpen({ externalRouteReady: true, override: undefined })).toBe(false);
  });

  it('reopens with PASSWORD_SIGN_IN=on, ignoring case and spaces', () => {
    expect(passwordSignInOpen({ externalRouteReady: true, override: 'on' })).toBe(true);
    expect(passwordSignInOpen({ externalRouteReady: true, override: ' ON ' })).toBe(true);
  });

  it('does not reopen for any other override value', () => {
    for (const override of ['1', 'true', 'off', 'yes', '']) expect(passwordSignInOpen({ externalRouteReady: true, override })).toBe(false);
  });
});

describe('passwordSignInState with the mode from ผู้ดูแลระบบ > การเข้าสู่ระบบ', () => {
  it('ON keeps it open even with ThaID or Provider ID ready', () => {
    expect(passwordSignInState({ externalRouteReady: true, override: undefined, mode: 'ON' })).toEqual({ open: true, reason: 'MODE_ON' });
  });

  it('OFF keeps it closed', () => {
    expect(passwordSignInState({ externalRouteReady: true, override: undefined, mode: 'OFF' })).toEqual({ open: false, reason: 'MODE_OFF' });
    expect(passwordSignInState({ externalRouteReady: false, override: undefined, mode: 'OFF' })).toEqual({ open: false, reason: 'MODE_OFF' });
  });

  it('PASSWORD_SIGN_IN=on on the server still wins, as the break-glass', () => {
    expect(passwordSignInState({ externalRouteReady: true, override: 'on', mode: 'OFF' })).toEqual({ open: true, reason: 'OVERRIDE' });
  });

  it('AUTO behaves as before', () => {
    expect(passwordSignInState({ externalRouteReady: true, override: undefined, mode: 'AUTO' })).toEqual({ open: false, reason: 'AUTO_ROUTE_READY' });
    expect(passwordSignInState({ externalRouteReady: false, override: undefined, mode: 'AUTO' })).toEqual({ open: true, reason: 'AUTO_NO_ROUTE' });
  });
});
