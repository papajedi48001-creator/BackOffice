import type { AuditEvent, OutboxEvent, RoomBookingDayStatus, RoomBookingHistoryAction, RoomBookingStatus } from '@backoffice/contracts';
import type { TimeRange } from './booking-days';

export interface RoomRecord { id: string; name: string; capacity: number; ownerOrganizationId: string; isBookable: boolean; }
export interface RoomBookingRecord { id: string; reference: string; roomId: string; bookerPersonId: string; bookerOrganizationId: string | null; title: string; attendeeCount: number; startMinute: number; endMinute: number; status: RoomBookingStatus; decidedByPersonId: string | null; }
export interface RoomBookingDayRecord { id: string; bookingId: string; roomId: string; bookingDate: string; startsAt: Date; endsAt: Date; status: RoomBookingDayStatus; }
export interface RoomBookingAddonRecord { id: string; bookingId: string; addonId: string; addonName: string; addonUnit: string; quantity: number; note: string | null; }
export interface RoomBookingHistoryEntry { id: string; bookingId: string; actorPersonId: string; action: RoomBookingHistoryAction; reason: string | null; }
export interface LockedRoomBooking { booking: RoomBookingRecord; days: RoomBookingDayRecord[]; room: RoomRecord; }

export interface RoomBookingRepository {
  transaction<T>(work: (repository: RoomBookingRepository) => Promise<T>): Promise<T>;
  lockRoom(roomId: string): Promise<RoomRecord | null>;
  findActiveAddons(addonIds: string[]): Promise<{ id: string; name: string; unit: string }[]>;
  findConflicts(roomId: string, ranges: TimeRange[]): Promise<TimeRange[]>;
  nextSequence(year: number): Promise<number>;
  currentOrganizationId(personId: string): Promise<string | null>;
  findApproverPersonIds(organizationId: string): Promise<string[]>;
  insertBooking(booking: RoomBookingRecord, days: RoomBookingDayRecord[], addons: RoomBookingAddonRecord[]): Promise<void>;
  getBookingForUpdate(bookingId: string): Promise<LockedRoomBooking | null>;
  updateBookingStatus(bookingId: string, status: RoomBookingStatus, decidedByPersonId: string | null): Promise<void>;
  releaseDays(dayIds: string[], releasedAt: Date): Promise<void>;
  appendHistory(entry: RoomBookingHistoryEntry): Promise<void>;
  saveOutbox(event: OutboxEvent): Promise<void>;
  appendAudit(event: AuditEvent): Promise<void>;
}
