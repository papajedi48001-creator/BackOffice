import { describe, expect, it } from 'vitest';
import type { RoomActor } from '@backoffice/contracts';
import { InMemoryRoomBookingRepository } from './in-memory-room-booking-repository';
import { BookingConflictError, RoomBookingService } from './room-booking-service';

// 2026-11-01 10:00 Bangkok
const now = new Date('2026-11-01T03:00:00Z');
const booker: RoomActor = { personId: 'booker', roles: [] };
const approver: RoomActor = { personId: 'approver', roles: [{ name: 'room-booking-approver', organizationId: 'admin-unit' }] };

function setup(clock: { now: Date } = { now }) {
  const repository = new InMemoryRoomBookingRepository();
  repository.rooms.set('room-1', { id: 'room-1', name: 'ห้องประชุม 1', capacity: 20, ownerOrganizationId: 'admin-unit', isBookable: true });
  repository.addons.set('projector', { id: 'projector', name: 'โปรเจกเตอร์', unit: 'เครื่อง', isActive: true });
  repository.addons.set('old-tv', { id: 'old-tv', name: 'ทีวีเก่า', unit: 'เครื่อง', isActive: false });
  repository.organizations.set('booker', 'nursing-unit');
  repository.approvers.push({ personId: 'approver', organizationId: 'admin-unit' }, { personId: 'approver-2', organizationId: null }, { personId: 'other-unit-approver', organizationId: 'other-unit' });
  let sequence = 0;
  const service = new RoomBookingService(repository, undefined, () => `id-${++sequence}`, () => clock.now);
  return { repository, service, clock };
}

const submission = { roomId: 'room-1', dates: ['2026-11-05', '2026-11-06', '2026-11-07'], startMinute: 540, endMinute: 720, title: 'อบรมพยาบาลใหม่', attendeeCount: 15, addons: [{ addonId: 'projector', quantity: 1, note: 'ต่อ HDMI' }] };
const notifications = (repository: InMemoryRoomBookingRepository) => repository.outbox.filter((event) => event.type === 'notification.in_app').map((event) => event.payload);

describe('RoomBookingService.submit', () => {
  it('holds every requested day and records the submission in one transaction', async () => {
    const { repository, service } = setup();

    const booking = await service.submit(booker, submission);

    expect(booking).toMatchObject({ reference: 'RB-2569-0001', status: 'PENDING', bookerPersonId: 'booker', bookerOrganizationId: 'nursing-unit', title: 'อบรมพยาบาลใหม่', decidedByPersonId: null });
    expect(repository.days.map((day) => [day.bookingDate, day.startsAt.toISOString(), day.status])).toEqual([
      ['2026-11-05', '2026-11-05T02:00:00.000Z', 'ACTIVE'], ['2026-11-06', '2026-11-06T02:00:00.000Z', 'ACTIVE'], ['2026-11-07', '2026-11-07T02:00:00.000Z', 'ACTIVE']
    ]);
    expect(repository.bookingAddons).toEqual([expect.objectContaining({ addonId: 'projector', addonName: 'โปรเจกเตอร์', addonUnit: 'เครื่อง', quantity: 1, note: 'ต่อ HDMI' })]);
    expect(repository.history).toEqual([expect.objectContaining({ bookingId: booking.id, actorPersonId: 'booker', action: 'SUBMITTED', reason: null })]);
    expect(repository.audit).toHaveLength(1);
    expect(repository.audit[0]).toMatchObject({ action: 'room_booking.submitted', targetType: 'room_booking', targetId: booking.id, result: 'SUCCESS', actorPersonId: 'booker' });
    expect(JSON.parse(repository.audit[0]!.metadata)).toEqual({ bookingReference: 'RB-2569-0001', roomId: 'room-1', status: 'PENDING', dayCount: 3 });
  });

  it('notifies the booker and every approver in scope without exposing the meeting title', async () => {
    const { repository, service } = setup();

    const booking = await service.submit(booker, submission);

    expect(notifications(repository)).toEqual([
      { recipientPersonId: 'booker', subject: 'ยื่นจองห้องแล้ว รออนุมัติ (RB-2569-0001)', targetPath: `/rooms/bookings/${booking.id}`, moduleCode: 'room-booking' },
      { recipientPersonId: 'approver', subject: 'มีการจองห้องรออนุมัติ (RB-2569-0001)', targetPath: `/rooms/bookings/${booking.id}`, moduleCode: 'room-booking' },
      { recipientPersonId: 'approver-2', subject: 'มีการจองห้องรออนุมัติ (RB-2569-0001)', targetPath: `/rooms/bookings/${booking.id}`, moduleCode: 'room-booking' }
    ]);
    expect(JSON.stringify(repository.outbox)).not.toContain('อบรมพยาบาลใหม่');
    expect(JSON.stringify(repository.outbox)).not.toContain('HDMI');
  });

  it('does not tell an approver that their own booking is waiting for approval', async () => {
    const { repository, service } = setup();

    await service.submit(approver, submission);

    expect(notifications(repository).map((payload) => [payload.recipientPersonId, payload.subject])).toEqual([
      ['approver', 'ยื่นจองห้องแล้ว รออนุมัติ (RB-2569-0001)'], ['approver-2', 'มีการจองห้องรออนุมัติ (RB-2569-0001)']
    ]);
  });

  it('numbers bookings in sequence within the Buddhist year', async () => {
    const { service } = setup();
    await service.submit(booker, submission);
    const second = await service.submit(booker, { ...submission, dates: ['2026-11-10'] });
    expect(second.reference).toBe('RB-2569-0002');
  });

  it.each([
    ['ROOM_NOT_FOUND', { roomId: 'missing' }],
    ['OVER_CAPACITY', { attendeeCount: 21 }],
    ['INVALID_ADDON', { addons: [{ addonId: 'old-tv', quantity: 1 }] }],
    ['INVALID_ADDON', { addons: [{ addonId: 'missing', quantity: 1 }] }],
    ['INVALID_TIME_RANGE', { startMinute: 600, endMinute: 540 }]
  ])('rejects the booking with %s', async (code, override) => {
    const { repository, service } = setup();
    await expect(service.submit(booker, { ...submission, ...override })).rejects.toThrow(code);
    expect(repository.bookings.size).toBe(0);
  });

  it('rejects a room that is closed for booking', async () => {
    const { repository, service } = setup();
    repository.rooms.set('room-1', { ...repository.rooms.get('room-1')!, isBookable: false });
    await expect(service.submit(booker, submission)).rejects.toThrow('ROOM_NOT_BOOKABLE');
  });

  it('rejects an overlapping booking and reports which days clash', async () => {
    const { service } = setup();
    await service.submit(booker, { ...submission, dates: ['2026-11-06'], startMinute: 600, endMinute: 720 });

    const attempt = service.submit({ personId: 'someone-else', roles: [] }, submission);

    await expect(attempt).rejects.toBeInstanceOf(BookingConflictError);
    await expect(attempt).rejects.toMatchObject({ message: 'BOOKING_CONFLICT', conflicts: [{ startsAt: new Date('2026-11-06T03:00:00Z'), endsAt: new Date('2026-11-06T05:00:00Z') }] });
  });

  it('accepts a booking that starts exactly when another one ends', async () => {
    const { service } = setup();
    await service.submit(booker, { ...submission, dates: ['2026-11-06'], startMinute: 540, endMinute: 720 });
    await expect(service.submit(booker, { ...submission, dates: ['2026-11-06'], startMinute: 720, endMinute: 780 })).resolves.toMatchObject({ status: 'PENDING' });
  });
});

describe('RoomBookingService.decide', () => {
  it('approves a pending booking and tells the booker', async () => {
    const { repository, service } = setup();
    const booking = await service.submit(booker, submission);
    repository.outbox = [];

    const decided = await service.decide(approver, { bookingId: booking.id, decision: 'APPROVE' });

    expect(decided).toMatchObject({ status: 'APPROVED', decidedByPersonId: 'approver' });
    expect(repository.bookings.get(booking.id)).toMatchObject({ status: 'APPROVED', decidedByPersonId: 'approver' });
    expect(repository.history.at(-1)).toMatchObject({ action: 'APPROVED', actorPersonId: 'approver', reason: null });
    expect(repository.audit.at(-1)).toMatchObject({ action: 'room_booking.approved', actorPersonId: 'approver' });
    expect(notifications(repository)).toEqual([{ recipientPersonId: 'booker', subject: 'การจองห้องได้รับอนุมัติ (RB-2569-0001)', targetPath: `/rooms/bookings/${booking.id}`, moduleCode: 'room-booking' }]);
  });

  it('keeps the rejection reason in the booking history only', async () => {
    const { repository, service } = setup();
    const booking = await service.submit(booker, submission);

    await service.decide(approver, { bookingId: booking.id, decision: 'REJECT', reason: 'ห้องปิดปรับปรุงช่วงนั้น' });

    expect(repository.bookings.get(booking.id)?.status).toBe('REJECTED');
    expect(repository.history.at(-1)).toMatchObject({ action: 'REJECTED', reason: 'ห้องปิดปรับปรุงช่วงนั้น' });
    expect(notifications(repository).at(-1)).toMatchObject({ recipientPersonId: 'booker', subject: 'การจองห้องไม่ได้รับอนุมัติ (RB-2569-0001)' });
    expect(JSON.stringify([repository.audit, repository.outbox])).not.toContain('ปิดปรับปรุง');
  });

  it('frees the rejected days for other bookings', async () => {
    const { service } = setup();
    const booking = await service.submit(booker, submission);
    await service.decide(approver, { bookingId: booking.id, decision: 'REJECT', reason: 'ไม่ผ่าน' });
    await expect(service.submit({ personId: 'someone-else', roles: [] }, submission)).resolves.toMatchObject({ status: 'PENDING' });
  });

  it('requires a reason to reject', async () => {
    const { service } = setup();
    const booking = await service.submit(booker, submission);
    await expect(service.decide(approver, { bookingId: booking.id, decision: 'REJECT' })).rejects.toThrow('REASON_REQUIRED');
  });

  it('does not let an approver decide their own booking', async () => {
    const { service } = setup();
    const booking = await service.submit(approver, submission);
    await expect(service.decide(approver, { bookingId: booking.id, decision: 'APPROVE' })).rejects.toThrow('CONFLICT_OF_INTEREST');
  });

  it.each([
    ['without the approver role', booker],
    ['scoped to another organization', { personId: 'other-unit-approver', roles: [{ name: 'room-booking-approver', organizationId: 'other-unit' }] }]
  ])('answers not found to a decision by someone %s', async (_label, actor) => {
    const { service } = setup();
    const booking = await service.submit({ personId: 'someone-else', roles: [] }, submission);
    await expect(service.decide(actor, { bookingId: booking.id, decision: 'APPROVE' })).rejects.toThrow('BOOKING_NOT_FOUND');
  });

  it('forbids the booker from deciding without the approver role', async () => {
    const { service } = setup();
    const booking = await service.submit(booker, submission);
    await expect(service.decide(booker, { bookingId: booking.id, decision: 'APPROVE' })).rejects.toThrow('FORBIDDEN');
  });

  it('reports an unknown booking as not found', async () => {
    const { service } = setup();
    await expect(service.decide(approver, { bookingId: 'missing', decision: 'APPROVE' })).rejects.toThrow('BOOKING_NOT_FOUND');
  });

  it('refuses to decide twice', async () => {
    const { service } = setup();
    const booking = await service.submit(booker, submission);
    await service.decide(approver, { bookingId: booking.id, decision: 'APPROVE' });
    await expect(service.decide(approver, { bookingId: booking.id, decision: 'REJECT', reason: 'เปลี่ยนใจ' })).rejects.toThrow('BOOKING_NOT_PENDING');
  });

  it('refuses to decide after the last day has ended', async () => {
    const { service, clock } = setup();
    const booking = await service.submit(booker, submission);
    clock.now = new Date('2026-11-07T05:00:00Z');
    await expect(service.decide(approver, { bookingId: booking.id, decision: 'APPROVE' })).rejects.toThrow('BOOKING_NOT_PENDING');
  });
});

describe('RoomBookingService.cancel', () => {
  async function approvedBooking(context: ReturnType<typeof setup>) {
    const booking = await context.service.submit(booker, submission);
    await context.service.decide(approver, { bookingId: booking.id, decision: 'APPROVE' });
    context.repository.outbox = [];
    return booking;
  }

  it('lets the booker cancel a pending booking before it starts', async () => {
    const { repository, service } = setup();
    const booking = await service.submit(booker, submission);
    repository.outbox = [];

    const result = await service.cancel(booker, { bookingId: booking.id, reason: 'เลื่อนการอบรม' });

    expect(result).toMatchObject({ booking: { status: 'CANCELLED' }, releasedDayCount: 0 });
    expect(repository.days.every((day) => day.status === 'ACTIVE')).toBe(true);
    expect(repository.history.at(-1)).toMatchObject({ action: 'CANCELLED', actorPersonId: 'booker', reason: 'เลื่อนการอบรม' });
    expect(repository.audit.at(-1)).toMatchObject({ action: 'room_booking.cancelled' });
    expect(notifications(repository)).toEqual([]);
    await expect(service.submit({ personId: 'someone-else', roles: [] }, submission)).resolves.toMatchObject({ status: 'PENDING' });
  });

  it('tells the approver who approved it when the booker cancels an approved booking', async () => {
    const context = setup();
    const booking = await approvedBooking(context);

    await context.service.cancel(booker, { bookingId: booking.id, reason: 'เลื่อนการอบรม' });

    expect(notifications(context.repository)).toEqual([{ recipientPersonId: 'approver', subject: 'ผู้จองยกเลิกการจองห้อง (RB-2569-0001)', targetPath: `/rooms/bookings/${booking.id}`, moduleCode: 'room-booking' }]);
    expect(JSON.stringify([context.repository.audit, context.repository.outbox])).not.toContain('เลื่อนการอบรม');
  });

  it('releases only the days that have not started once the booking is under way', async () => {
    const context = setup();
    const booking = await approvedBooking(context);
    context.clock.now = new Date('2026-11-06T03:00:00Z'); // 10:00 on day two

    const result = await context.service.cancel(booker, { bookingId: booking.id, reason: 'อบรมจบเร็ว' });

    expect(result).toMatchObject({ booking: { status: 'APPROVED' }, releasedDayCount: 1 });
    expect(context.repository.days.map((day) => [day.bookingDate, day.status])).toEqual([['2026-11-05', 'ACTIVE'], ['2026-11-06', 'ACTIVE'], ['2026-11-07', 'RELEASED']]);
    expect(context.repository.history.at(-1)).toMatchObject({ action: 'DAYS_RELEASED', reason: 'อบรมจบเร็ว' });
    expect(context.repository.audit.at(-1)).toMatchObject({ action: 'room_booking.days_released' });
    expect(JSON.parse(context.repository.audit.at(-1)!.metadata)).toMatchObject({ dayCount: 1 });
  });

  it('tells the booker there is nothing left to release on the last day', async () => {
    const context = setup();
    const booking = await approvedBooking(context);
    context.clock.now = new Date('2026-11-07T03:00:00Z');
    await expect(context.service.cancel(booker, { bookingId: booking.id, reason: 'จบแล้ว' })).rejects.toThrow('NOTHING_TO_RELEASE');
  });

  it('does not let the booker cancel a pending booking that has already started', async () => {
    const { service, clock } = setup();
    const booking = await service.submit(booker, submission);
    clock.now = new Date('2026-11-06T03:00:00Z');
    await expect(service.cancel(booker, { bookingId: booking.id, reason: 'ไม่ใช้แล้ว' })).rejects.toThrow('CANCEL_NOT_ALLOWED');
  });

  it('lets an approver release the remaining days and tells the booker', async () => {
    const context = setup();
    const booking = await approvedBooking(context);
    context.clock.now = new Date('2026-11-05T04:00:00Z');

    const result = await context.service.cancel(approver, { bookingId: booking.id, reason: 'ผู้บริหารใช้ห้องด่วน' });

    expect(result.releasedDayCount).toBe(2);
    expect(notifications(context.repository)).toEqual([{ recipientPersonId: 'booker', subject: 'การจองห้องถูกยกเลิกโดยผู้ดูแล (RB-2569-0001)', targetPath: `/rooms/bookings/${booking.id}`, moduleCode: 'room-booking' }]);
  });

  it('lets an approver cancel an approved booking before it starts', async () => {
    const context = setup();
    const booking = await approvedBooking(context);
    await expect(context.service.cancel(approver, { bookingId: booking.id, reason: 'ห้องเสีย' })).resolves.toMatchObject({ booking: { status: 'CANCELLED' } });
  });

  it('does not cancel a booking that has already ended', async () => {
    const context = setup();
    const booking = await approvedBooking(context);
    context.clock.now = new Date('2026-11-08T03:00:00Z');
    await expect(context.service.cancel(approver, { bookingId: booking.id, reason: 'ย้อนหลัง' })).rejects.toThrow('CANCEL_NOT_ALLOWED');
  });

  it('does not cancel a rejected booking', async () => {
    const { service } = setup();
    const booking = await service.submit(booker, submission);
    await service.decide(approver, { bookingId: booking.id, decision: 'REJECT', reason: 'ไม่ผ่าน' });
    await expect(service.cancel(booker, { bookingId: booking.id, reason: 'ยกเลิก' })).rejects.toThrow('CANCEL_NOT_ALLOWED');
  });

  it('answers not found to someone who is neither the booker nor an approver', async () => {
    const { service } = setup();
    const booking = await service.submit(booker, submission);
    await expect(service.cancel({ personId: 'someone-else', roles: [] }, { bookingId: booking.id, reason: 'แกล้ง' })).rejects.toThrow('BOOKING_NOT_FOUND');
  });

  it('requires a reason', async () => {
    const { service } = setup();
    const booking = await service.submit(booker, submission);
    await expect(service.cancel(booker, { bookingId: booking.id, reason: '' })).rejects.toThrow();
  });
});
