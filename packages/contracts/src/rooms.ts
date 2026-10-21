import { z } from 'zod';
import type { AccessSubject } from './access.ts';

export const ROOM_BOOKING_MODULE = 'room-booking';

// Times are stored in UTC; Asia/Bangkok has no daylight saving, so a fixed offset is exact.
export const roomBookingPolicy = { openMinute: 7 * 60, closeMinute: 20 * 60, slotMinutes: 30, maxAdvanceDays: 90, maxDays: 14, utcOffsetMinutes: 7 * 60 } as const;

export const roomBookingStatusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']);
export type RoomBookingStatus = z.infer<typeof roomBookingStatusSchema>;
export type RoomBookingDayStatus = 'ACTIVE' | 'RELEASED';
export type RoomBookingHistoryAction = 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'DAYS_RELEASED';

const bookingDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const minuteOfDaySchema = z.number().int().min(0).max(24 * 60);
const reasonSchema = z.string().trim().min(1).max(1000);

export const submitRoomBookingInputSchema = z.object({
  roomId: z.string().min(1),
  dates: z.array(bookingDateSchema).min(1).max(roomBookingPolicy.maxDays),
  startMinute: minuteOfDaySchema,
  endMinute: minuteOfDaySchema,
  title: z.string().trim().min(1).max(200),
  attendeeCount: z.number().int().min(1),
  addons: z.array(z.object({ addonId: z.string().min(1), quantity: z.number().int().min(1).max(999), note: z.string().trim().max(500).optional() })).max(20).default([])
});
export type SubmitRoomBookingInput = z.input<typeof submitRoomBookingInputSchema>;

export const decideRoomBookingInputSchema = z.object({ bookingId: z.string().min(1), decision: z.enum(['APPROVE', 'REJECT']), reason: reasonSchema.optional() });
export type DecideRoomBookingInput = z.input<typeof decideRoomBookingInputSchema>;

export const cancelRoomBookingInputSchema = z.object({ bookingId: z.string().min(1), reason: reasonSchema });
export type CancelRoomBookingInput = z.input<typeof cancelRoomBookingInputSchema>;

export const roomInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  place: z.string().trim().min(1).max(200),
  capacity: z.number().int().min(1).max(1000),
  equipment: z.string().trim().max(1000).default(''),
  ownerOrganizationId: z.string().min(1),
  isBookable: z.boolean()
});
export type RoomInput = z.input<typeof roomInputSchema>;

export const roomAddonInputSchema = z.object({ name: z.string().trim().min(1).max(120), unit: z.string().trim().min(1).max(30), isActive: z.boolean() });
export type RoomAddonInput = z.input<typeof roomAddonInputSchema>;

export interface RoomActor { personId: string; roles: AccessSubject['roles']; }
