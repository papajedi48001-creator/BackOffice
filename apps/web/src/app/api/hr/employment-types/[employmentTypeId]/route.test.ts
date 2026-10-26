// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readSession: vi.fn(), getSharedDatabase: vi.fn(), update: vi.fn() }));
vi.mock('../../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), EmploymentTypeService: class { update = mocks.update; } }));

import { PUT } from './route';

const manager = { authenticated: true, personId: 'person-a', roles: [{ name: 'hr-manager', organizationId: null }], dataOwnerModules: ['hr'], hospitalWideDataOwnerModules: ['hr'] };
const body = { code: 'DAILY_EMPLOYEE', name: 'ลูกจ้างรายวัน', isActive: false, sortOrder: 6 };
const put = (value: unknown) => PUT(new Request('http://localhost/api/hr/employment-types/type-6', { method: 'PUT', body: JSON.stringify(value) }), { params: Promise.resolve({ employmentTypeId: 'type-6' }) });

afterEach(() => vi.clearAllMocks());

describe('PUT /api/hr/employment-types/[employmentTypeId]', () => {
  it('updates the type in the path and maps not found and duplicates', async () => {
    mocks.readSession.mockResolvedValue(manager);
    mocks.getSharedDatabase.mockReturnValue({});
    mocks.update.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false, code: 'NOT_FOUND' }).mockResolvedValueOnce({ ok: false, code: 'DUPLICATE_CODE' });
    expect((await put(body)).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith('type-6', body, 'person-a');
    expect((await put(body)).status).toBe(404);
    expect((await put(body)).status).toBe(409);
  });

  it('rejects an anonymous caller', async () => {
    mocks.readSession.mockResolvedValueOnce(null);
    expect((await put(body)).status).toBe(401);
  });
});
