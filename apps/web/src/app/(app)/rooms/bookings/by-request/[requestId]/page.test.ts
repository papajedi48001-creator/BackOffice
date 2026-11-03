import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ pageActor: vi.fn(), bookingIdForRequest: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => { throw new Error(`REDIRECT ${path}`); },
  notFound: () => { throw new Error('NOT_FOUND'); }
}));
vi.mock('../../../../../../lib/actor', () => ({ pageActor: mocks.pageActor }));
vi.mock('../../../../../../lib/database', () => ({ getSharedDatabase: () => ({}) }));
vi.mock('@backoffice/core', () => ({ RoomBookingQueries: vi.fn(() => ({ bookingIdForRequest: mocks.bookingIdForRequest })) }));

import RoomBookingByRequestPage from './page';

afterEach(() => vi.clearAllMocks());
const open = (requestId: string) => RoomBookingByRequestPage({ params: Promise.resolve({ requestId }) });

it('takes a head from a คำขอ notice to the booking page, which checks who may see it', async () => {
  mocks.pageActor.mockResolvedValue({ personId: 'head-a', roles: [] });
  mocks.bookingIdForRequest.mockResolvedValue('booking-1');
  await expect(open('request-1')).rejects.toThrow('REDIRECT /rooms/bookings/booking-1');
  expect(mocks.bookingIdForRequest).toHaveBeenCalledWith('request-1');
});

it('shows not found for a คำขอ that is not a room booking', async () => {
  mocks.pageActor.mockResolvedValue({ personId: 'head-a', roles: [] });
  mocks.bookingIdForRequest.mockResolvedValue(null);
  await expect(open('request-x')).rejects.toThrow('NOT_FOUND');
});

it('sends a signed-out visitor to sign in first', async () => {
  mocks.pageActor.mockResolvedValue(null);
  await expect(open('request-1')).rejects.toThrow('REDIRECT /');
  expect(mocks.bookingIdForRequest).not.toHaveBeenCalled();
});
