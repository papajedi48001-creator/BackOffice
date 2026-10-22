// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readSession: vi.fn(), getSharedDatabase: vi.fn(), setUnitType: vi.fn() }));
vi.mock('../../../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), OrganizationHeadService: class { setUnitType = mocks.setUnitType; } }));

import { PUT } from './route';

const hrManager = { authenticated: true, personId: 'person-a', roles: [{ name: 'hr-manager', organizationId: null }], dataOwnerModules: ['hr'], hospitalWideDataOwnerModules: ['hr'] };
const hrReader = { ...hrManager, roles: [{ name: 'hr-reader', organizationId: null }] };

function put(body: unknown) {
  return PUT(new Request('http://localhost/api/hr/organizations/org-1/unit-type', { method: 'PUT', body: JSON.stringify(body) }), { params: Promise.resolve({ organizationId: 'org-1' }) });
}

afterEach(() => vi.clearAllMocks());

describe('PUT /api/hr/organizations/[organizationId]/unit-type', () => {
  it('rejects an anonymous caller and an hr reader', async () => {
    mocks.readSession.mockResolvedValueOnce(null);
    expect((await put({ unitType: 'SECTION' })).status).toBe(401);
    mocks.readSession.mockResolvedValueOnce(hrReader);
    expect((await put({ unitType: 'SECTION' })).status).toBe(403);
    expect(mocks.setUnitType).not.toHaveBeenCalled();
  });

  it('rejects an unknown unit type', async () => {
    mocks.readSession.mockResolvedValue(hrManager);
    mocks.getSharedDatabase.mockReturnValue({});

    const response = await put({ unitType: 'MISSION' });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'invalid_input' });
  });

  it('saves the unit type as the signed-in hr manager', async () => {
    mocks.readSession.mockResolvedValue(hrManager);
    mocks.getSharedDatabase.mockReturnValue({});
    mocks.setUnitType.mockResolvedValue({ ok: true });

    expect((await put({ unitType: null })).status).toBe(200);
    expect(mocks.setUnitType).toHaveBeenCalledWith({ organizationId: 'org-1', unitType: null }, 'person-a');
  });

  it('reports an unknown organization as not found', async () => {
    mocks.readSession.mockResolvedValue(hrManager);
    mocks.getSharedDatabase.mockReturnValue({});
    mocks.setUnitType.mockResolvedValue({ ok: false, code: 'ORGANIZATION_NOT_FOUND' });

    const response = await put({ unitType: 'DIVISION' });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'ORGANIZATION_NOT_FOUND' });
  });
});
