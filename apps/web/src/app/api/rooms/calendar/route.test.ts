import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthorizationError } from '../../../../lib/require-authorized';

const mocks = vi.hoisted(() => ({ requireActor: vi.fn(), calendar: vi.fn() }));
vi.mock('../../../../lib/actor', () => ({ requireActor: mocks.requireActor }));
vi.mock('../../../../lib/database', () => ({ getSharedDatabase: () => ({}) }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...(await importOriginal<typeof import('@backoffice/core')>()), RoomBookingQueries: vi.fn(() => ({ calendar: mocks.calendar })) }));

import { GET } from './route';

afterEach(() => vi.clearAllMocks());

describe('GET /api/rooms/calendar', () => {
  it('requires a signed-in person', async () => {
    mocks.requireActor.mockRejectedValue(new AuthorizationError(401));
    expect((await GET(new Request('http://localhost/api/rooms/calendar?from=2026-11-02&to=2026-11-08'))).status).toBe(401);
  });

  it('reads whole Bangkok days for the requested range and room', async () => {
    mocks.requireActor.mockResolvedValue({ personId: 'person-a', roles: [] });
    mocks.calendar.mockResolvedValue([]);
    const response = await GET(new Request('http://localhost/api/rooms/calendar?from=2026-11-02&to=2026-11-08&roomId=room-1'));
    expect(response.status).toBe(200);
    expect(mocks.calendar).toHaveBeenCalledWith(new Date('2026-11-01T17:00:00Z'), new Date('2026-11-08T17:00:00Z'), 'room-1');
  });

  it.each(['from=2026-11-08&to=2026-11-02', 'from=2026-11-01&to=2027-01-31', 'from=bad&to=2026-11-02'])('rejects the range %s', async (query) => {
    mocks.requireActor.mockResolvedValue({ personId: 'person-a', roles: [] });
    expect((await GET(new Request(`http://localhost/api/rooms/calendar?${query}`))).status).toBe(400);
  });
});
