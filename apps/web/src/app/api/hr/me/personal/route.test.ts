// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readSession: vi.fn(), getSharedDatabase: vi.fn(), updateOwnPersonal: vi.fn() }));
vi.mock('../../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), HrProfileService: class { updateOwnPersonal = mocks.updateOwnPersonal; } }));

import { PUT } from './route';

const staff = { authenticated: true, personId: 'person-self', roles: [], dataOwnerModules: [] };
const put = (body: unknown) => PUT(new Request('http://localhost/api/hr/me/personal', { method: 'PUT', body: JSON.stringify(body) }));

afterEach(() => vi.clearAllMocks());

describe('PUT /api/hr/me/personal', () => {
  it('rejects an anonymous caller', async () => {
    mocks.readSession.mockResolvedValueOnce(null);
    expect((await put({ firstName: 'สมชาย' })).status).toBe(401);
  });

  it('always updates the session person, ignoring a person id in the body', async () => {
    mocks.readSession.mockResolvedValue(staff);
    mocks.getSharedDatabase.mockReturnValue({});
    mocks.updateOwnPersonal.mockResolvedValue({ ok: true });
    expect((await put({ personId: 'someone-else', firstName: 'สมชาย', gender: 'MALE' })).status).toBe(200);
    expect(mocks.updateOwnPersonal).toHaveBeenCalledWith('person-self', { firstName: 'สมชาย', gender: 'MALE' }, staff);
  });

  it('refuses work fields and names them without their values', async () => {
    mocks.readSession.mockResolvedValue(staff);
    mocks.getSharedDatabase.mockReturnValue({});
    const response = await put({ positionTitle: 'ผู้อำนวยการ' });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'invalid_input', fields: ['positionTitle'] });
    expect(mocks.updateOwnPersonal).not.toHaveBeenCalled();
  });
});
