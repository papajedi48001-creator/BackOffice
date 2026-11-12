import { describe, expect, it } from 'vitest';
import { passwordSignInOpen } from './password-sign-in';

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
