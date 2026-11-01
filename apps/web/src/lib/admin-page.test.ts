// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readSession: vi.fn(), getSharedDatabase: vi.fn(), redirect: vi.fn(() => { throw new Error('NEXT_REDIRECT'); }) }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('./session', () => ({ readSession: mocks.readSession }));
vi.mock('./database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));

import { adminPage } from './admin-page';

afterEach(() => vi.resetAllMocks());

describe('adminPage', () => {
  it('sends a signed-out visitor to sign in', async () => {
    mocks.readSession.mockResolvedValue(null);
    await expect(adminPage()).rejects.toThrow('NEXT_REDIRECT');
  });

  it('refuses a module manager who is not ผู้ดูแลระบบ, without opening the database', async () => {
    mocks.readSession.mockResolvedValue({ authenticated: true, personId: 'p', roles: [{ name: 'hr-manager', organizationId: null }], dataOwnerModules: ['hr'] });
    await expect(adminPage()).resolves.toEqual({ ok: false, reason: 'no_access' });
    expect(mocks.getSharedDatabase).not.toHaveBeenCalled();
  });

  it('lets an admin in', async () => {
    mocks.readSession.mockResolvedValue({ authenticated: true, personId: 'p', roles: [{ name: 'admin', organizationId: null }], dataOwnerModules: [] });
    mocks.getSharedDatabase.mockReturnValue({ query: vi.fn() });
    await expect(adminPage()).resolves.toMatchObject({ ok: true });
  });
});
