// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readSession: vi.fn(), readPendingPasswordChange: vi.fn(), getSharedDatabase: vi.fn(), changeOwnPassword: vi.fn() }));
vi.mock('../../../../lib/session', async (importOriginal) => ({ ...await importOriginal<typeof import('../../../../lib/session')>(), readSession: mocks.readSession, readPendingPasswordChange: mocks.readPendingPasswordChange }));
vi.mock('../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), PersonAccountService: class { changeOwnPassword = mocks.changeOwnPassword; } }));

import { POST } from './route';

const post = (body: unknown) => POST(new Request('http://localhost/api/auth/password', { method: 'POST', body: JSON.stringify(body) }));
afterEach(() => vi.clearAllMocks());

it('changes the signed-in person\'s own password, then clears the session cookie so they sign in again', async () => {
  mocks.getSharedDatabase.mockReturnValue({});
  mocks.readSession.mockResolvedValue(null);
  mocks.readPendingPasswordChange.mockResolvedValue({ personId: 'p1' });
  mocks.changeOwnPassword.mockResolvedValueOnce({ ok: true });
  const response = await post({ newPassword: 'brand-new-pass' });
  expect(response.status).toBe(200);
  expect(mocks.changeOwnPassword).toHaveBeenCalledWith('p1', { newPassword: 'brand-new-pass' });
  expect(response.headers.get('set-cookie')).toContain('backoffice_session=;');
});

it('maps a wrong current password and a reused password, and refuses without a session', async () => {
  mocks.getSharedDatabase.mockReturnValue({});
  mocks.readSession.mockResolvedValue({ authenticated: true, personId: 'p1', roles: [], dataOwnerModules: [] });
  mocks.readPendingPasswordChange.mockResolvedValue(null);
  mocks.changeOwnPassword.mockResolvedValueOnce({ ok: false, code: 'WRONG_PASSWORD' });
  expect((await post({ currentPassword: 'x', newPassword: 'brand-new-pass' })).status).toBe(400);
  mocks.changeOwnPassword.mockResolvedValueOnce({ ok: false, code: 'SAME_PASSWORD' });
  await expect((await post({ currentPassword: 'x', newPassword: 'brand-new-pass' })).json()).resolves.toEqual({ error: 'SAME_PASSWORD' });
  mocks.readSession.mockResolvedValue(null);
  expect((await post({ newPassword: 'brand-new-pass' })).status).toBe(401);
  expect((await post({ newPassword: 'short' })).status).toBe(401);
});
