// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readSession: vi.fn(), getSharedDatabase: vi.fn(), create: vi.fn() }));
vi.mock('../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), EmploymentTypeService: class { create = mocks.create; } }));

import { POST } from './route';

const manager = { authenticated: true, personId: 'person-a', roles: [{ name: 'hr-manager', organizationId: null }], dataOwnerModules: ['hr'], hospitalWideDataOwnerModules: ['hr'] };
const reader = { ...manager, roles: [{ name: 'hr-reader', organizationId: null }] };
const body = { code: 'INTERN', name: 'นักศึกษาฝึกงาน', isActive: true, sortOrder: 7 };
const post = (value: unknown) => POST(new Request('http://localhost/api/hr/employment-types', { method: 'POST', body: JSON.stringify(value) }));

afterEach(() => vi.clearAllMocks());

describe('POST /api/hr/employment-types', () => {
  it('lets only a hospital-wide hr manager add a type', async () => {
    mocks.getSharedDatabase.mockReturnValue({});
    mocks.readSession.mockResolvedValueOnce(reader);
    expect((await post(body)).status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('creates a type, reports a duplicate as 409 and bad input as 400', async () => {
    mocks.readSession.mockResolvedValue(manager);
    mocks.getSharedDatabase.mockReturnValue({});
    mocks.create.mockResolvedValueOnce({ ok: true, id: 'type-1' }).mockResolvedValueOnce({ ok: false, code: 'DUPLICATE_NAME' });
    const created = await post(body);
    expect(created.status).toBe(200);
    await expect(created.json()).resolves.toEqual({ ok: true, id: 'type-1' });
    expect(mocks.create).toHaveBeenCalledWith(body, 'person-a');
    expect((await post(body)).status).toBe(409);
    expect((await post({ ...body, code: 'lower' })).status).toBe(400);
  });
});
