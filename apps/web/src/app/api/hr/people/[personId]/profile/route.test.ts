// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readSession: vi.fn(), getSharedDatabase: vi.fn(), updateProfile: vi.fn() }));
vi.mock('../../../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), HrProfileService: class { updateProfile = mocks.updateProfile; } }));

import { PUT } from './route';

const manager = { authenticated: true, personId: 'person-a', roles: [{ name: 'hr-manager', organizationId: null }], dataOwnerModules: ['hr'] };
const put = (body: unknown) => PUT(new Request('http://localhost/api/hr/people/person-b/profile', { method: 'PUT', body: typeof body === 'string' ? body : JSON.stringify(body) }), { params: Promise.resolve({ personId: 'person-b' }) });

afterEach(() => vi.clearAllMocks());

describe('PUT /api/hr/people/[personId]/profile', () => {
  it('needs a session and a database', async () => {
    mocks.readSession.mockResolvedValueOnce(null);
    expect((await put({ positionLevel: 'ชำนาญการ' })).status).toBe(401);
    mocks.readSession.mockResolvedValueOnce(manager);
    mocks.getSharedDatabase.mockReturnValueOnce(undefined);
    expect((await put({ positionLevel: 'ชำนาญการ' })).status).toBe(503);
  });

  it('rejects invalid input naming only the fields', async () => {
    mocks.readSession.mockResolvedValue(manager);
    mocks.getSharedDatabase.mockReturnValue({});
    const response = await put({ birthDate: '2026-02-30', phone: '0812345678' });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'invalid_input', fields: ['birthDate', 'phone'] });
    expect((await put('not json')).status).toBe(400);
    expect(mocks.updateProfile).not.toHaveBeenCalled();
  });

  it('saves for the session actor and maps service codes', async () => {
    mocks.readSession.mockResolvedValue(manager);
    mocks.getSharedDatabase.mockReturnValue({});
    mocks.updateProfile.mockResolvedValueOnce({ ok: true });
    expect((await put({ positionLevel: 'ชำนาญการ' })).status).toBe(200);
    expect(mocks.updateProfile).toHaveBeenCalledWith('person-b', { positionLevel: 'ชำนาญการ' }, manager);
    for (const [code, status] of [['FORBIDDEN', 403], ['NOT_FOUND', 404], ['GENDER_REQUIRED', 400], ['INACTIVE_EMPLOYMENT_TYPE', 400]] as const) {
      mocks.updateProfile.mockResolvedValueOnce({ ok: false, code });
      const response = await put({ positionLevel: 'ชำนาญการ' });
      expect(response.status).toBe(status);
      await expect(response.json()).resolves.toEqual({ error: code });
    }
  });
});
