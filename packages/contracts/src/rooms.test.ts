import { describe, expect, it } from 'vitest';
import { cancelRoomBookingInputSchema, decideRoomBookingInputSchema, roomInputSchema, submitRoomBookingInputSchema } from './rooms';

const validSubmission = { roomId: 'room-1', dates: ['2026-11-05'], startMinute: 540, endMinute: 720, title: 'ประชุมคณะกรรมการ', attendeeCount: 10, addons: [{ addonId: 'addon-1', quantity: 1 }] };

describe('room booking contracts', () => {
  it('accepts a valid submission and defaults addons to none', () => {
    expect(submitRoomBookingInputSchema.parse({ ...validSubmission, addons: undefined }).addons).toEqual([]);
  });

  it('rejects more than 14 dates in one booking', () => {
    const dates = Array.from({ length: 15 }, (_, index) => `2026-11-${String(index + 1).padStart(2, '0')}`);
    expect(submitRoomBookingInputSchema.safeParse({ ...validSubmission, dates }).success).toBe(false);
  });

  it('rejects a title that is blank after trimming', () => {
    expect(submitRoomBookingInputSchema.safeParse({ ...validSubmission, title: '   ' }).success).toBe(false);
  });

  it('rejects an addon quantity of zero', () => {
    expect(submitRoomBookingInputSchema.safeParse({ ...validSubmission, addons: [{ addonId: 'addon-1', quantity: 0 }] }).success).toBe(false);
  });

  it('rejects a date that is not YYYY-MM-DD', () => {
    expect(submitRoomBookingInputSchema.safeParse({ ...validSubmission, dates: ['5/11/2026'] }).success).toBe(false);
  });

  it('requires a cancellation reason', () => {
    expect(cancelRoomBookingInputSchema.safeParse({ bookingId: 'booking-1', reason: ' ' }).success).toBe(false);
    expect(cancelRoomBookingInputSchema.parse({ bookingId: 'booking-1', reason: ' ประชุมเลื่อน ' }).reason).toBe('ประชุมเลื่อน');
  });

  it('only accepts approve or reject decisions', () => {
    expect(decideRoomBookingInputSchema.safeParse({ bookingId: 'booking-1', decision: 'RETURN' }).success).toBe(false);
  });

  it('requires a positive room capacity', () => {
    expect(roomInputSchema.safeParse({ name: 'ห้องประชุม 1', place: 'อาคารอำนวยการ ชั้น 2', capacity: 0, ownerOrganizationId: 'unit-a', isBookable: true }).success).toBe(false);
  });
});
