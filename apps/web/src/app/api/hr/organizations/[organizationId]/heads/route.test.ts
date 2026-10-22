// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readSession: vi.fn(), getSharedDatabase: vi.fn(), assign: vi.fn() }));
vi.mock('../../../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), OrganizationHeadService: class { assign = mocks.assign; } }));

import { POST } from './route';

const hrManager = { authenticated: true, personId: 'person-a', roles: [{ name: 'hr-manager', organizationId: null }], dataOwnerModules: ['hr'], hospitalWideDataOwnerModules: ['hr'] };
const hrReader = { ...hrManager, roles: [{ name: 'hr-reader', organizationId: null }] };

function post(body: unknown) {
  return POST(new Request('http://localhost/api/hr/organizations/org-1/heads', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ organizationId: 'org-1' }) });
}

function ready() {
  mocks.readSession.mockResolvedValue(hrManager);
  mocks.getSharedDatabase.mockReturnValue({});
}

afterEach(() => vi.clearAllMocks());

describe('POST /api/hr/organizations/[organizationId]/heads', () => {
  it('rejects an anonymous caller and an hr reader', async () => {
    mocks.readSession.mockResolvedValueOnce(null);
    expect((await post({ personId: 'p', effectiveFrom: '2026-10-22' })).status).toBe(401);
    mocks.readSession.mockResolvedValueOnce(hrReader);
    expect((await post({ personId: 'p', effectiveFrom: '2026-10-22' })).status).toBe(403);
    expect(mocks.assign).not.toHaveBeenCalled();
  });

  it('rejects a missing person or a malformed date', async () => {
    ready();
    expect((await post({ effectiveFrom: '2026-10-22' })).status).toBe(400);
    expect((await post({ personId: 'p', effectiveFrom: '22/10/2026' })).status).toBe(400);
  });

  it('starts the term at midnight Bangkok time of the chosen day', async () => {
    ready();
    mocks.assign.mockResolvedValue({ kind: 'assign', closeCurrentId: null });

    expect((await post({ personId: 'person-b', effectiveFrom: '2026-10-22' })).status).toBe(200);
    expect(mocks.assign).toHaveBeenCalledWith({ organizationId: 'org-1', personId: 'person-b', effectiveFrom: new Date('2026-10-21T17:00:00.000Z') }, 'person-a');
  });

  it('maps rule failures to their codes', async () => {
    ready();
    mocks.assign.mockResolvedValueOnce({ kind: 'error', code: 'ORGANIZATION_NOT_FOUND' });
    const missing = await post({ personId: 'person-b', effectiveFrom: '2026-10-22' });
    expect(missing.status).toBe(404);

    mocks.assign.mockResolvedValueOnce({ kind: 'error', code: 'PERSON_NOT_ACTIVE' });
    const inactive = await post({ personId: 'person-b', effectiveFrom: '2026-10-22' });
    expect(inactive.status).toBe(400);
    await expect(inactive.json()).resolves.toEqual({ error: 'PERSON_NOT_ACTIVE' });
  });
});
