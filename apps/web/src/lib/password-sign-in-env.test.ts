import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ providerSsoEnabled: vi.fn(() => false) }));
vi.mock('./provider-sso', () => ({ providerSsoEnabled: mocks.providerSsoEnabled }));

import { isPasswordSignInOpen } from './password-sign-in';

const saved = { ...process.env };
afterEach(() => { process.env = { ...saved }; vi.restoreAllMocks(); });

describe('isPasswordSignInOpen', () => {
  it('stays closed and warns once when the Provider ID settings are present but broken', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    process.env.PROVIDER_ID_CLIENT_ID = 'provider-client';
    delete process.env.PASSWORD_SIGN_IN;
    expect(isPasswordSignInOpen()).toBe(false);
    expect(warn).toHaveBeenCalledWith('password sign-in closed: Provider ID settings are present but incomplete');
  });

  it('is open on a fresh install with no Provider ID settings at all', () => {
    for (const key of Object.keys(process.env)) if (key.startsWith('PROVIDER_ID_')) delete process.env[key];
    delete process.env.PASSWORD_SIGN_IN;
    expect(isPasswordSignInOpen()).toBe(true);
  });

  it('treats an unreadable PASSWORD_SIGN_IN_FILE as no override instead of failing the sign-in page', () => {
    mocks.providerSsoEnabled.mockReturnValueOnce(true);
    delete process.env.PASSWORD_SIGN_IN;
    process.env.PASSWORD_SIGN_IN_FILE = '/nonexistent/password-sign-in';
    expect(isPasswordSignInOpen()).toBe(false);
  });
});

describe('isPasswordSignInOpen on a machine with only PROVIDER_ID_ENV', () => {
  it('stays open: the environment name alone is not a Provider ID client', () => {
    for (const key of Object.keys(process.env)) if (key.startsWith('PROVIDER_ID_')) delete process.env[key];
    process.env.PROVIDER_ID_ENV = 'prd';
    delete process.env.PASSWORD_SIGN_IN;
    expect(isPasswordSignInOpen()).toBe(true);
  });
});
