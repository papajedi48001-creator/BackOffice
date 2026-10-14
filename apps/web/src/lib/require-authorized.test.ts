import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readSession: vi.fn() }));
vi.mock('./session', () => ({ readSession: mocks.readSession }));

import { requireAuthorized } from './require-authorized';

afterEach(() => vi.clearAllMocks());

describe('requireAuthorized', () => {
  it('rejects an unauthenticated request before protected data is read', async () => {
    mocks.readSession.mockResolvedValue(null);
    await expect(requireAuthorized(new Request('http://localhost/api/hr/person'))).rejects.toMatchObject({ status: 401 });
  });

  it('allows a server-side session whose scoped role can read the resource', async () => {
    mocks.readSession.mockResolvedValue({ authenticated: true, personId: 'person-a', roles: [{ name: 'hr-reader', organizationId: 'unit-a' }], dataOwnerModules: [] });
    const request = new Request('http://localhost/api/hr/person', { headers: { cookie: 'backoffice_session=opaque-token' } });

    await expect(requireAuthorized(request, 'hr.person.read', { moduleCode: 'hr', organizationId: 'unit-a' })).resolves.toMatchObject({ personId: 'person-a' });
  });

  it('forbids a session whose role does not cover the resource', async () => {
    mocks.readSession.mockResolvedValue({ authenticated: true, personId: 'person-a', roles: [{ name: 'hr-reader', organizationId: 'unit-a' }], dataOwnerModules: [] });

    await expect(requireAuthorized(new Request('http://localhost/api/hr/person'), 'hr.person.read', { moduleCode: 'hr', organizationId: 'unit-b' })).rejects.toMatchObject({ status: 403 });
  });
});
