import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthorizationError } from '../../../../lib/require-authorized';

const mocks = vi.hoisted(() => ({ requireActor: vi.fn(), submit: vi.fn(), myBookings: vi.fn() }));
vi.mock('../../../../lib/actor', () => ({ requireActor: mocks.requireActor }));
vi.mock('../../../../lib/database', () => ({ getSharedDatabase: () => ({}) }));
vi.mock('@backoffice/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@backoffice/core')>()),
  RoomBookingService: vi.fn(() => ({ submit: mocks.submit })),
  RoomBookingQueries: vi.fn(() => ({ myBookings: mocks.myBookings }))
}));

import { BookingConflictError } from '@backoffice/core';
import { GET, POST } from './route';

afterEach(() => vi.clearAllMocks());
const post = (body: unknown) => POST(new Request('http://localhost/api/rooms/bookings', { method: 'POST', body: JSON.stringify(body) }));

describe('/api/rooms/bookings', () => {
  it('rejects a submission without a session before touching bookings', async () => {
    mocks.requireActor.mockRejectedValue(new AuthorizationError(401));
    const response = await post({});
    expect(response.status).toBe(401);
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it('submits as the signed-in person and returns the reference', async () => {
    mocks.requireActor.mockResolvedValue({ personId: 'person-a', roles: [] });
    mocks.submit.mockResolvedValue({ id: 'booking-1', reference: 'RB-2569-0001', status: 'PENDING', title: 'ประชุม' });
    const body = { roomId: 'room-1', dates: ['2026-11-05'], startMinute: 540, endMinute: 600, title: 'ประชุม', attendeeCount: 5, bookerPersonId: 'someone-else' };

    const response = await post(body);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: 'booking-1', reference: 'RB-2569-0001', status: 'PENDING' });
    expect(mocks.submit).toHaveBeenCalledWith({ personId: 'person-a', roles: [] }, body);
  });

  it('answers 409 with the clashing times', async () => {
    mocks.requireActor.mockResolvedValue({ personId: 'person-a', roles: [] });
    mocks.submit.mockRejectedValue(new BookingConflictError([{ startsAt: new Date('2026-11-05T02:00:00Z'), endsAt: new Date('2026-11-05T03:00:00Z') }]));
    const response = await post({});
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: 'BOOKING_CONFLICT', conflicts: [{ startsAt: '2026-11-05T02:00:00.000Z' }] });
  });

  it('lists only the signed-in person bookings', async () => {
    mocks.requireActor.mockResolvedValue({ personId: 'person-a', roles: [] });
    mocks.myBookings.mockResolvedValue([]);
    const response = await GET(new Request('http://localhost/api/rooms/bookings'));
    expect(response.status).toBe(200);
    expect(mocks.myBookings).toHaveBeenCalledWith('person-a');
  });
});
