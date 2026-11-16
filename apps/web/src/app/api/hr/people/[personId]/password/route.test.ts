// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ resetPassword: vi.fn(), withSessionAndDatabase: vi.fn(), isPasswordSignInOpen: vi.fn(async () => true) }));
vi.mock('../../../../../../lib/password-sign-in', () => ({ isPasswordSignInOpen: mocks.isPasswordSignInOpen }));
vi.mock('../../../profile-route', async (importOriginal) => ({ ...await importOriginal<typeof import('../../../profile-route')>(), withSessionAndDatabase: mocks.withSessionAndDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), PersonAccountService: class { resetPassword = mocks.resetPassword; } }));

import * as route from './route';

const actor = { authenticated: true, personId: 'hr', roles: [], dataOwnerModules: [] };
afterEach(() => vi.clearAllMocks());

it('resets to the default password with no password in the request, and no longer lets HR set one', async () => {
  mocks.withSessionAndDatabase.mockImplementation(async (_request: Request, work: (session: unknown, database: unknown) => Promise<Response>) => work(actor, {}));
  mocks.resetPassword.mockResolvedValueOnce({ ok: true });
  const response = await route.POST(new Request('http://localhost', { method: 'POST' }), { params: Promise.resolve({ personId: 'p1' }) });
  expect(response.status).toBe(200);
  expect(mocks.resetPassword).toHaveBeenCalledWith('p1', actor);
  expect('PUT' in route).toBe(false);
});

it('refuses รีเซ็ตรหัสผ่าน with password_sign_in_off while password sign-in is closed', async () => {
  mocks.withSessionAndDatabase.mockImplementation(async (_request: Request, work: (session: unknown, database: unknown) => Promise<Response>) => work(actor, {}));
  mocks.isPasswordSignInOpen.mockResolvedValueOnce(false);
  const response = await route.POST(new Request('http://localhost', { method: 'POST' }), { params: Promise.resolve({ personId: 'p1' }) });
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ error: 'password_sign_in_off' });
  expect(mocks.resetPassword).not.toHaveBeenCalled();
});
