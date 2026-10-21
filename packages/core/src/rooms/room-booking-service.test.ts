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
      { recipientPersonId: 'booker', subject: 'ยื่นจองห้องแล้ว รออนุมัติ (RB-2569-0001)', targetPath: `/rooms/bookings/${booking.id}` },
      { recipientPersonId: 'approver', subject: 'มีการจองห้องรออนุมัติ (RB-2569-0001)', targetPath: `/rooms/bookings/${booking.id}` },
      { recipientPersonId: 'approver-2', subject: 'มีการจองห้องรออนุมัติ (RB-2569-0001)', targetPath: `/rooms/bookings/${booking.id}` }
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
