import { randomUUID } from 'node:crypto';
import { cancelRoomBookingInputSchema, decideRoomBookingInputSchema, notificationEventPayloadSchema, ROOM_BOOKING_MODULE, submitRoomBookingInputSchema, type CancelRoomBookingInput, type DecideRoomBookingInput, type Permission, type RoomActor, type RoomBookingHistoryAction, type SubmitRoomBookingInput } from '@backoffice/contracts';
import { AuthorizationService } from '../access/authorization-service';
import { AuditService } from '../audit/audit-service';
import { buddhistYear, toBookingRanges, type TimeRange } from './booking-days';
import type { RoomBookingDayRecord, RoomBookingRecord, RoomBookingRepository, RoomRecord } from './room-booking-repository';

export class BookingConflictError extends Error {
  constructor(public readonly conflicts: TimeRange[]) { super('BOOKING_CONFLICT'); }
}

type AuditAction = 'room_booking.submitted' | 'room_booking.approved' | 'room_booking.rejected' | 'room_booking.cancelled' | 'room_booking.days_released';

export class RoomBookingService {
  constructor(
    private readonly repository: RoomBookingRepository,
    private readonly authorizer: AuthorizationService = new AuthorizationService(),
    private readonly createId: () => string = randomUUID,
    private readonly now: () => Date = () => new Date()
  ) {}

  async submit(actor: RoomActor, input: SubmitRoomBookingInput): Promise<RoomBookingRecord> {
    const valid = submitRoomBookingInputSchema.parse(input);
    const now = this.now();
    const ranges = toBookingRanges(valid, now);
    return this.repository.transaction(async (repository) => {
      const room = await repository.lockRoom(valid.roomId);
      if (!room) throw new Error('ROOM_NOT_FOUND');
      if (!room.isBookable) throw new Error('ROOM_NOT_BOOKABLE');
      if (valid.attendeeCount > room.capacity) throw new Error('OVER_CAPACITY');
      const requestedAddonIds = [...new Set(valid.addons.map((addon) => addon.addonId))];
      if (requestedAddonIds.length !== valid.addons.length) throw new Error('INVALID_ADDON');
      const activeAddons = new Map((await repository.findActiveAddons(requestedAddonIds)).map((addon) => [addon.id, addon]));
      if (activeAddons.size !== requestedAddonIds.length) throw new Error('INVALID_ADDON');
      const conflicts = await repository.findConflicts(room.id, ranges);
      if (conflicts.length > 0) throw new BookingConflictError(conflicts);

      const id = this.createId();
      const sequence = await repository.nextSequence(buddhistYear(now));
      const booking: RoomBookingRecord = {
        id, reference: `RB-${buddhistYear(now)}-${String(sequence).padStart(4, '0')}`, roomId: room.id, bookerPersonId: actor.personId,
        bookerOrganizationId: await repository.currentOrganizationId(actor.personId), title: valid.title, attendeeCount: valid.attendeeCount,
        startMinute: valid.startMinute, endMinute: valid.endMinute, status: 'PENDING', decidedByPersonId: null
      };
      const days: RoomBookingDayRecord[] = ranges.map((range) => ({ id: this.createId(), bookingId: id, roomId: room.id, bookingDate: range.date, startsAt: range.startsAt, endsAt: range.endsAt, status: 'ACTIVE' }));
      const addons = valid.addons.map((addon) => ({ id: this.createId(), bookingId: id, addonId: addon.addonId, addonName: activeAddons.get(addon.addonId)!.name, addonUnit: activeAddons.get(addon.addonId)!.unit, quantity: addon.quantity, note: addon.note || null }));
      await repository.insertBooking(booking, days, addons);
      const historyId = await this.record(repository, booking, actor.personId, 'SUBMITTED', null, 'room_booking.submitted', days.length);
      await this.notify(repository, booking, historyId, actor.personId, `ยื่นจองห้องแล้ว รออนุมัติ (${booking.reference})`);
      const approvers = (await repository.findApproverPersonIds(room.ownerOrganizationId)).filter((personId) => personId !== actor.personId);
      for (const personId of approvers) await this.notify(repository, booking, historyId, personId, `มีการจองห้องรออนุมัติ (${booking.reference})`);
      return booking;
    });
  }

  async decide(actor: RoomActor, input: DecideRoomBookingInput): Promise<RoomBookingRecord> {
    const valid = decideRoomBookingInputSchema.parse(input);
    if (valid.decision === 'REJECT' && !valid.reason) throw new Error('REASON_REQUIRED');
    return this.repository.transaction(async (repository) => {
      const locked = await repository.getBookingForUpdate(valid.bookingId);
      if (!locked) throw new Error('BOOKING_NOT_FOUND');
      if (!(await this.isAllowed(actor, 'room.booking.decide', locked.room))) throw new Error('FORBIDDEN');
      if (locked.booking.bookerPersonId === actor.personId) throw new Error('CONFLICT_OF_INTEREST');
      const now = this.now();
      if (locked.booking.status !== 'PENDING' || !locked.days.some((day) => day.status === 'ACTIVE' && day.endsAt > now)) throw new Error('BOOKING_NOT_PENDING');
      const approved = valid.decision === 'APPROVE';
      const booking: RoomBookingRecord = { ...locked.booking, status: approved ? 'APPROVED' : 'REJECTED', decidedByPersonId: actor.personId };
      await repository.updateBookingStatus(booking.id, booking.status, booking.decidedByPersonId);
      const activeDays = locked.days.filter((day) => day.status === 'ACTIVE').length;
      const historyId = await this.record(repository, booking, actor.personId, approved ? 'APPROVED' : 'REJECTED', approved ? null : valid.reason!, approved ? 'room_booking.approved' : 'room_booking.rejected', activeDays);
      await this.notify(repository, booking, historyId, booking.bookerPersonId, approved ? `การจองห้องได้รับอนุมัติ (${booking.reference})` : `การจองห้องไม่ได้รับอนุมัติ (${booking.reference})`);
      return booking;
    });
  }

  async cancel(actor: RoomActor, input: CancelRoomBookingInput): Promise<{ booking: RoomBookingRecord; releasedDayCount: number }> {
    const valid = cancelRoomBookingInputSchema.parse(input);
    return this.repository.transaction(async (repository) => {
      const locked = await repository.getBookingForUpdate(valid.bookingId);
      if (!locked) throw new Error('BOOKING_NOT_FOUND');
      const isBooker = locked.booking.bookerPersonId === actor.personId;
      const isApprover = await this.isAllowed(actor, 'room.booking.decide', locked.room);
      if (!isBooker && !isApprover) throw new Error('FORBIDDEN');
      if (locked.booking.status !== 'PENDING' && locked.booking.status !== 'APPROVED') throw new Error('CANCEL_NOT_ALLOWED');
      const now = this.now();
      const activeDays = locked.days.filter((day) => day.status === 'ACTIVE');
      const started = activeDays.some((day) => day.startsAt <= now);
      if (isApprover ? !activeDays.some((day) => day.endsAt > now) : started && locked.booking.status !== 'APPROVED') throw new Error('CANCEL_NOT_ALLOWED');

      let booking = locked.booking;
      let releasedDayCount = 0;
      let historyId: string;
      if (!started) {
        booking = { ...booking, status: 'CANCELLED' };
        await repository.updateBookingStatus(booking.id, booking.status, booking.decidedByPersonId);
        historyId = await this.record(repository, booking, actor.personId, 'CANCELLED', valid.reason, 'room_booking.cancelled', activeDays.length);
      } else {
        const futureDays = activeDays.filter((day) => day.startsAt > now);
        if (futureDays.length === 0) throw new Error('NOTHING_TO_RELEASE');
        await repository.releaseDays(futureDays.map((day) => day.id), now);
        releasedDayCount = futureDays.length;
        historyId = await this.record(repository, booking, actor.personId, 'DAYS_RELEASED', valid.reason, 'room_booking.days_released', releasedDayCount);
      }
      if (!isBooker) await this.notify(repository, booking, historyId, booking.bookerPersonId, `การจองห้องถูกยกเลิกโดยผู้ดูแล (${booking.reference})`);
      else if (locked.booking.status === 'APPROVED' && booking.decidedByPersonId) await this.notify(repository, booking, historyId, booking.decidedByPersonId, `ผู้จองยกเลิกการจองห้อง (${booking.reference})`);
      return { booking, releasedDayCount };
    });
  }

  protected async isAllowed(actor: RoomActor, permission: Permission, room: RoomRecord): Promise<boolean> {
    return (await this.authorizer.canAccess({ authenticated: true, personId: actor.personId, roles: actor.roles, dataOwnerModules: [] }, permission, { moduleCode: ROOM_BOOKING_MODULE, organizationId: room.ownerOrganizationId })).allowed;
  }

  // Returns the history entry id, which also keys the notifications of this step.
  private async record(repository: RoomBookingRepository, booking: RoomBookingRecord, actorPersonId: string, action: RoomBookingHistoryAction, reason: string | null, auditAction: AuditAction, dayCount: number): Promise<string> {
    const historyId = this.createId();
    await repository.appendHistory({ id: historyId, bookingId: booking.id, actorPersonId, action, reason });
    await new AuditService({ append: (event) => repository.appendAudit(event) }, this.createId).recordAudit({
      actorPersonId, action: auditAction, targetType: 'room_booking', targetId: booking.id, result: 'SUCCESS',
      metadata: { bookingReference: booking.reference, roomId: booking.roomId, status: booking.status, dayCount }
    });
    return historyId;
  }

  private async notify(repository: RoomBookingRepository, booking: RoomBookingRecord, historyId: string, recipientPersonId: string, subject: string): Promise<void> {
    const payload = notificationEventPayloadSchema.parse({ recipientPersonId, subject, targetPath: `/rooms/bookings/${booking.id}` });
    await repository.saveOutbox({ id: this.createId(), type: 'notification.in_app', idempotencyKey: `notification.in_app:room-booking:${historyId}:${recipientPersonId}`, payload, occurredAt: this.now().toISOString(), processedAt: null });
  }
}
