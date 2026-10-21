import { describe, expect, it, vi } from 'vitest';
import { cancelRoomBookingInputSchema } from '@backoffice/contracts';
import { BookingConflictError } from '@backoffice/core';
import { AuthorizationError } from '../../../lib/require-authorized';
import { roomErrorResponse } from './room-error-response';

describe('roomErrorResponse', () => {
  it.each([
    [new AuthorizationError(401), 401, 'unauthenticated'],
    [new Error('FORBIDDEN'), 403, 'FORBIDDEN'],
    [new Error('CONFLICT_OF_INTEREST'), 403, 'CONFLICT_OF_INTEREST'],
    [new Error('BOOKING_NOT_FOUND'), 404, 'BOOKING_NOT_FOUND'],
    [new Error('OVER_CAPACITY'), 400, 'OVER_CAPACITY'],
    [new Error('REASON_REQUIRED'), 400, 'REASON_REQUIRED'],
    [new Error('CANCEL_NOT_ALLOWED'), 409, 'CANCEL_NOT_ALLOWED'],
    [cancelRoomBookingInputSchema.safeParse({ bookingId: 'b', reason: '' }).error, 400, 'INVALID_INPUT']
  ])('maps %s to %i', async (error, status, code) => {
    const response = roomErrorResponse(error);
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: code });
  });

  it('lists the clashing times of a conflict', async () => {
    const response = roomErrorResponse(new BookingConflictError([{ startsAt: new Date('2026-11-05T02:00:00Z'), endsAt: new Date('2026-11-05T05:00:00Z') }]));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'BOOKING_CONFLICT', conflicts: [{ startsAt: '2026-11-05T02:00:00.000Z', endsAt: '2026-11-05T05:00:00.000Z' }] });
  });

  it('hides unexpected errors and logs only a code', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = roomErrorResponse(new Error('Duplicate entry ประชุมลับ for key'));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'room_booking_failed' });
    expect(JSON.stringify(log.mock.calls)).not.toContain('ประชุมลับ');
    log.mockRestore();
  });
});
