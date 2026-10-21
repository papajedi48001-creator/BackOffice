import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ requireActor: vi.fn(), cancel: vi.fn() }));
vi.mock('../../../../../../lib/actor', () => ({ requireActor: mocks.requireActor }));
vi.mock('../../../../../../lib/database', () => ({ getSharedDatabase: () => ({}) }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...(await importOriginal<typeof import('@backoffice/core')>()), RoomBookingService: vi.fn(() => ({ cancel: mocks.cancel })) }));

import { cancelRoomBookingInputSchema } from '@backoffice/contracts';
import { POST } from './route';

afterEach(() => vi.clearAllMocks());
const cancel = (body: unknown) => POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ bookingId: 'booking-1' }) });

describe('POST /api/rooms/bookings/:bookingId/cancellation', () => {
  it('rejects a cancellation without a reason', async () => {
    mocks.requireActor.mockResolvedValue({ personId: 'person-a', roles: [] });
    mocks.cancel.mockImplementation(async (_actor, input) => cancelRoomBookingInputSchema.parse(input));
    const response = await cancel({ reason: '' });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'INVALID_INPUT' });
  });

  it('returns how many days were released without echoing the reason', async () => {
    mocks.requireActor.mockResolvedValue({ personId: 'person-a', roles: [] });
    mocks.cancel.mockResolvedValue({ booking: { id: 'booking-1', reference: 'RB-2569-0001', status: 'APPROVED', title: 'ประชุม' }, releasedDayCount: 2 });
    const response = await cancel({ reason: 'จบเร็ว' });
    expect(await response.json()).toEqual({ id: 'booking-1', reference: 'RB-2569-0001', status: 'APPROVED', releasedDayCount: 2 });
    expect(mocks.cancel).toHaveBeenCalledWith({ personId: 'person-a', roles: [] }, { bookingId: 'booking-1', reason: 'จบเร็ว' });
  });
});
