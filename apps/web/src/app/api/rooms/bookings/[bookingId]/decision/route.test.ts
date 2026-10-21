import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ requireActor: vi.fn(), decide: vi.fn() }));
vi.mock('../../../../../../lib/actor', () => ({ requireActor: mocks.requireActor }));
vi.mock('../../../../../../lib/database', () => ({ getSharedDatabase: () => ({}) }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...(await importOriginal<typeof import('@backoffice/core')>()), RoomBookingService: vi.fn(() => ({ decide: mocks.decide })) }));

import { POST } from './route';

afterEach(() => vi.clearAllMocks());
const decide = (body: unknown) => POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ bookingId: 'booking-1' }) });

describe('POST /api/rooms/bookings/:bookingId/decision', () => {
  it('decides the booking in the URL, not one in the body', async () => {
    mocks.requireActor.mockResolvedValue({ personId: 'approver', roles: [] });
    mocks.decide.mockResolvedValue({ id: 'booking-1', reference: 'RB-2569-0001', status: 'REJECTED' });

    const response = await decide({ bookingId: 'other', decision: 'REJECT', reason: 'ห้องไม่ว่าง' });

    expect(response.status).toBe(200);
    expect(mocks.decide).toHaveBeenCalledWith({ personId: 'approver', roles: [] }, { bookingId: 'booking-1', decision: 'REJECT', reason: 'ห้องไม่ว่าง' });
    expect(JSON.stringify(await response.json())).not.toContain('ห้องไม่ว่าง');
  });

  it('forbids someone who may not decide', async () => {
    mocks.requireActor.mockResolvedValue({ personId: 'person-a', roles: [] });
    mocks.decide.mockRejectedValue(new Error('FORBIDDEN'));
    expect((await decide({ decision: 'APPROVE' })).status).toBe(403);
  });
});
