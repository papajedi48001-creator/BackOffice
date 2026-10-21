import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readSession: vi.fn() }));
vi.mock('./session', () => ({ readSession: mocks.readSession }));

import { requireActor } from './actor';

afterEach(() => vi.clearAllMocks());

describe('requireActor', () => {
  it('rejects a request without a signed-in session', async () => {
    mocks.readSession.mockResolvedValue(null);
    await expect(requireActor(new Request('http://localhost/api/rooms/bookings'))).rejects.toMatchObject({ status: 401 });
  });

  it('exposes only the person and roles of the current session', async () => {
    mocks.readSession.mockResolvedValue({ authenticated: true, personId: 'person-a', roles: [{ name: 'room-booking-approver', organizationId: null }], dataOwnerModules: ['hr'] });
    await expect(requireActor(new Request('http://localhost'))).resolves.toEqual({ personId: 'person-a', roles: [{ name: 'room-booking-approver', organizationId: null }] });
  });
});
