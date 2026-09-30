import { describe, expect, it } from 'vitest';
import { createSessionToken } from './session';
import { requireAuthorized } from './require-authorized';

describe('requireAuthorized', () => {
  it('rejects an unauthenticated request before protected data is read', async () => {
    await expect(requireAuthorized(new Request('http://localhost/api/hr/person'))).rejects.toMatchObject({ status: 401 });
  });

  it('allows a signed session whose scoped role can read the resource', async () => {
    const token = createSessionToken({ authenticated: true, personId: 'person-a', roles: [{ name: 'hr-reader', organizationId: 'unit-a' }], dataOwnerModules: [] });
    const request = new Request('http://localhost/api/hr/person', { headers: { cookie: `backoffice_session=${token}` } });

    await expect(requireAuthorized(request, 'hr.person.read', { moduleCode: 'hr', organizationId: 'unit-a' })).resolves.toMatchObject({ personId: 'person-a' });
  });
});
