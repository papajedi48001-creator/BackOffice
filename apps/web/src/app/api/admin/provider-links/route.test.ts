// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readSession: vi.fn(), getSharedDatabase: vi.fn(), config: vi.fn(), adminLink: vi.fn(), adminUnlink: vi.fn() }));
vi.mock('../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('../../../../lib/provider-sso', async (importOriginal) => ({ ...await importOriginal<typeof import('../../../../lib/provider-sso')>(), providerSsoConfig: mocks.config, externalLoginService: () => ({ adminLink: mocks.adminLink, adminUnlink: mocks.adminUnlink }) }));

import { POST } from './route';
import { DELETE } from './[personId]/route';

const admin = { authenticated: true, personId: 'person-admin', roles: [{ name: 'admin', organizationId: null }], dataOwnerModules: [] };
const hrManager = { authenticated: true, personId: 'person-hr', roles: [{ name: 'hr-manager', organizationId: null }], dataOwnerModules: ['hr'], hospitalWideDataOwnerModules: ['hr'] };
const personId = '0b6f3c1e-5d1a-4c8e-9a51-2f7c1d9e8b10';
const pendingId = '1c7a4d2f-6e2b-4d9f-8b62-3a8d2eaf9c21';
const request = (method: string, body: unknown) => new Request('http://localhost/api/admin/provider-links', { method, body: JSON.stringify(body) });
const params = { params: Promise.resolve({ personId }) };

beforeEach(() => {
  mocks.readSession.mockResolvedValue(admin);
  mocks.getSharedDatabase.mockReturnValue({});
  mocks.config.mockReturnValue({ healthUrl: 'https://moph.test', apiUrl: 'https://provider.test', healthClientId: 'h', healthClientSecret: 's', providerClientId: 'p', providerSecretKey: 'k', redirectUri: 'https://b/cb' });
});
afterEach(() => vi.resetAllMocks());

describe('admin Provider ID links API', () => {
  it('refuses a non-admin and a module manager with 403 before reading input', async () => {
    for (const session of [hrManager, { ...admin, roles: [{ name: 'hr-manager', organizationId: null }] }]) {
      mocks.readSession.mockResolvedValue(session);
      const body = { json: vi.fn() };
      expect((await POST(Object.assign(request('POST', { pendingId, personId }), body))).status).toBe(403);
      expect((await DELETE(request('DELETE', { reason: 'x' }), params)).status).toBe(403);
      expect(body.json).not.toHaveBeenCalled();
    }
    expect(mocks.adminLink).not.toHaveBeenCalled();
    expect(mocks.adminUnlink).not.toHaveBeenCalled();
  });

  it('links a pending login to a person as the signed-in admin', async () => {
    mocks.adminLink.mockResolvedValue({ ok: true });
    expect((await POST(request('POST', { pendingId, personId }))).status).toBe(201);
    expect(mocks.adminLink).toHaveBeenCalledWith('person-admin', pendingId, personId);
  });

  it('answers a person linked elsewhere with 409', async () => {
    mocks.adminLink.mockResolvedValue({ ok: false, code: 'ALREADY_LINKED' });
    const response = await POST(request('POST', { pendingId, personId }));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: 'ALREADY_LINKED' });
  });

  it('requires a reason to unlink and passes it to the service', async () => {
    expect((await DELETE(request('DELETE', {}), params)).status).toBe(400);
    expect((await DELETE(request('DELETE', { reason: '   ' }), params)).status).toBe(400);
    expect((await DELETE(request('DELETE', { reason: 'x'.repeat(501) }), params)).status).toBe(400);
    mocks.adminUnlink.mockResolvedValue({ ok: true });
    expect((await DELETE(request('DELETE', { reason: ' ผูกผิดคน ' }), params)).status).toBe(200);
    expect(mocks.adminUnlink).toHaveBeenCalledWith('person-admin', personId, 'ผูกผิดคน');
  });

  it('is 404 when Provider SSO is not configured', async () => {
    mocks.config.mockReturnValue(null);
    expect((await POST(request('POST', { pendingId, personId }))).status).toBe(404);
  });
});
