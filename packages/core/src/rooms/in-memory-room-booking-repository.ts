import type { AuditEvent, OutboxEvent } from '@backoffice/contracts';
import { rangesOverlap, type TimeRange } from './booking-days';
import type { RoomBookingAddonRecord, RoomBookingDayRecord, RoomBookingHistoryEntry, RoomBookingRecord, RoomBookingRepository, RoomRecord } from './room-booking-repository';

// Test double with the same observable behaviour as the MariaDB repository.
export class InMemoryRoomBookingRepository implements RoomBookingRepository {
  rooms = new Map<string, RoomRecord>();
  addons = new Map<string, { id: string; name: string; unit: string; isActive: boolean }>();
  bookings = new Map<string, RoomBookingRecord>();
  days: (RoomBookingDayRecord & { releasedAt?: Date })[] = [];
  bookingAddons: RoomBookingAddonRecord[] = [];
  history: RoomBookingHistoryEntry[] = [];
  outbox: OutboxEvent[] = [];
  audit: AuditEvent[] = [];
  sequences = new Map<number, number>();
  organizations = new Map<string, string>();
  approvers: { personId: string; organizationId: string | null }[] = [];
  headRequests: { id: string; requestorPersonId: string; organizationId: string; status: 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'CANCELLED' }[] = [];

  /** Stands in for the head's เห็นชอบ in คำขอ, which the workflow hook applies on MariaDB. */
  headApprove(bookingId: string) { const booking = this.bookings.get(bookingId)!; this.bookings.set(bookingId, { ...booking, status: 'PENDING' }); const request = this.headRequests.find((entry) => entry.id === booking.requestId); if (request) request.status = 'APPROVED'; }

  async transaction<T>(work: (repository: RoomBookingRepository) => Promise<T>): Promise<T> { return work(this); }
  async lockRoom(roomId: string) { return this.rooms.get(roomId) ?? null; }
  async findActiveAddons(addonIds: string[]) { return addonIds.map((id) => this.addons.get(id)).filter((addon) => addon?.isActive).map((addon) => ({ id: addon!.id, name: addon!.name, unit: addon!.unit })); }
  async findConflicts(roomId: string, ranges: TimeRange[]) {
    return this.days.filter((day) => day.roomId === roomId && day.status === 'ACTIVE' && ['HEAD_REVIEW', 'PENDING', 'APPROVED'].includes(this.bookings.get(day.bookingId)?.status ?? '') && ranges.some((range) => rangesOverlap(day, range)))
      .map(({ startsAt, endsAt }) => ({ startsAt, endsAt }));
  }
  async nextSequence(year: number) { const next = (this.sequences.get(year) ?? 0) + 1; this.sequences.set(year, next); return next; }
  /** Everyone else belongs to some unit unless a test says otherwise. */
  defaultOrganization: string | null = 'other-unit';
  async currentOrganizationId(personId: string) { return this.organizations.get(personId) ?? this.defaultOrganization; }
  async findApproverPersonIds(organizationId: string) { return [...new Set(this.approvers.filter((approver) => approver.organizationId === null || approver.organizationId === organizationId).map((approver) => approver.personId))]; }
  async openHeadRequest(input: { requestorPersonId: string; organizationId: string }) { const id = `request-${this.headRequests.length + 1}`; this.headRequests.push({ id, ...input, status: 'IN_REVIEW' }); return id; }
  async cancelHeadRequest(input: { requestId: string }) { const request = this.headRequests.find((entry) => entry.id === input.requestId); if (request?.status === 'IN_REVIEW') request.status = 'CANCELLED'; }
  async insertBooking(booking: RoomBookingRecord, days: RoomBookingDayRecord[], addons: RoomBookingAddonRecord[]) { this.bookings.set(booking.id, { ...booking }); this.days.push(...days.map((day) => ({ ...day }))); this.bookingAddons.push(...addons); }
  async getBookingForUpdate(bookingId: string) {
    const booking = this.bookings.get(bookingId);
    if (!booking) return null;
    return { booking: { ...booking }, days: this.days.filter((day) => day.bookingId === bookingId).map((day) => ({ id: day.id, bookingId: day.bookingId, roomId: day.roomId, bookingDate: day.bookingDate, startsAt: day.startsAt, endsAt: day.endsAt, status: day.status })), room: this.rooms.get(booking.roomId)! };
  }
  async updateBookingStatus(bookingId: string, status: RoomBookingRecord['status'], decidedByPersonId: string | null) { const booking = this.bookings.get(bookingId)!; this.bookings.set(bookingId, { ...booking, status, decidedByPersonId }); }
  async releaseDays(dayIds: string[], releasedAt: Date) { for (const day of this.days) if (dayIds.includes(day.id)) { day.status = 'RELEASED'; day.releasedAt = releasedAt; } }
  async appendHistory(entry: RoomBookingHistoryEntry) { this.history.push(entry); }
  async saveOutbox(event: OutboxEvent) { this.outbox.push(event); }
  async appendAudit(event: AuditEvent) { this.audit.push(event); }
}
