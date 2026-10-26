// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readSession: vi.fn(), getSharedDatabase: vi.fn(), updateContact: vi.fn() }));
vi.mock('../../../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), HrProfileService: class { updateContact = mocks.updateContact; } }));

import { PUT } from './route';

const manager = { authenticated: true, personId: 'person-a', roles: [{ name: 'hr-manager', organizationId: null }], dataOwnerModules: ['hr'] };
const put = (body: unknown) => PUT(new Request('http://localhost/api/hr/people/person-b/contact', { method: 'PUT', body: JSON.stringify(body) }), { params: Promise.resolve({ personId: 'person-b' }) });

afterEach(() => vi.clearAllMocks());

describe('PUT /api/hr/people/[personId]/contact', () => {
  it('updates the person in the path and maps a refusal to 403', async () => {
    mocks.readSession.mockResolvedValue(manager);
    mocks.getSharedDatabase.mockReturnValue({});
    mocks.updateContact.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false, code: 'FORBIDDEN' });
    expect((await put({ phone: '0812345678' })).status).toBe(200);
    expect(mocks.updateContact).toHaveBeenCalledWith('person-b', { phone: '0812345678' }, manager);
    expect((await put({ phone: '0812345678' })).status).toBe(403);
    expect((await put({ phone: 'abc' })).status).toBe(400);
  });
});
