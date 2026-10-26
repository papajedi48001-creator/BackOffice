// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readSession: vi.fn(), getSharedDatabase: vi.fn(), updateContact: vi.fn() }));
vi.mock('../../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), HrProfileService: class { updateContact = mocks.updateContact; } }));

import { PUT } from './route';

const staff = { authenticated: true, personId: 'person-self', roles: [], dataOwnerModules: [] };
const put = (body: unknown) => PUT(new Request('http://localhost/api/hr/me/contact', { method: 'PUT', body: JSON.stringify(body) }));

afterEach(() => vi.clearAllMocks());

describe('PUT /api/hr/me/contact', () => {
  it('rejects an anonymous caller', async () => {
    mocks.readSession.mockResolvedValueOnce(null);
    expect((await put({ phone: '0812345678' })).status).toBe(401);
  });

  it('always updates the session person, ignoring a person id in the body', async () => {
    mocks.readSession.mockResolvedValue(staff);
    mocks.getSharedDatabase.mockReturnValue({});
    mocks.updateContact.mockResolvedValue({ ok: true });
    expect((await put({ personId: 'someone-else', phone: '0812345678' })).status).toBe(200);
    expect(mocks.updateContact).toHaveBeenCalledWith('person-self', { phone: '0812345678' }, staff);
  });
});
