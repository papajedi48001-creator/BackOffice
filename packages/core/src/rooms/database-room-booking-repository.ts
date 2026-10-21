import type { AuditEvent, OutboxEvent, RoomBookingStatus } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { roleGrantsPermission } from '../access/policy';
import type { TimeRange } from './booking-days';
import type { LockedRoomBooking, RoomBookingAddonRecord, RoomBookingDayRecord, RoomBookingHistoryEntry, RoomBookingRecord, RoomBookingRepository, RoomRecord } from './room-booking-repository';
import type { RoomAddonDetails, RoomCatalogRepository, RoomDetails } from './room-catalog-service';

type StoredRoom = Omit<RoomRecord, 'isBookable'> & { isBookable: number };
type StoredDay = Omit<RoomBookingDayRecord, 'startsAt' | 'endsAt'> & { startsAt: Date | string; endsAt: Date | string };

export function toMariaDbDatetime(instant: Date): string {
  return instant.toISOString().slice(0, 19).replace('T', ' ');
}

// mysql2 reads DATETIME as local time unless the pool is UTC; parse the wall-clock value as UTC explicitly.
export function fromMariaDbDatetime(value: Date | string): Date {
  if (value instanceof Date) return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate(), value.getHours(), value.getMinutes(), value.getSeconds()));
  return new Date(`${value.replace(' ', 'T')}Z`);
}

export function fromMariaDbDate(value: Date | string): string {
  if (typeof value === 'string') return value.slice(0, 10);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

const roomColumns = 'id, name, capacity, owner_organization_id AS ownerOrganizationId, is_bookable AS isBookable';
const bookingColumns = 'id, reference, room_id AS roomId, booker_person_id AS bookerPersonId, booker_organization_id AS bookerOrganizationId, title, attendee_count AS attendeeCount, start_minute AS startMinute, end_minute AS endMinute, status, decided_by_person_id AS decidedByPersonId';

export class DatabaseRoomBookingRepository implements RoomBookingRepository {
  constructor(private readonly database: Database) {}

  transaction<T>(work: (repository: RoomBookingRepository) => Promise<T>): Promise<T> {
    return this.database.transaction((database) => work(new DatabaseRoomBookingRepository(database)));
  }

  async lockRoom(roomId: string): Promise<RoomRecord | null> {
    const row = (await this.database.query<StoredRoom>(`SELECT ${roomColumns} FROM room WHERE id = ? FOR UPDATE`, [roomId]))[0];
    return row ? { ...row, isBookable: Boolean(row.isBookable) } : null;
  }

  async findActiveAddons(addonIds: string[]) {
    if (addonIds.length === 0) return [];
    return this.database.query<{ id: string; name: string; unit: string }>(`SELECT id, name, unit FROM room_addon WHERE is_active = 1 AND id IN (${addonIds.map(() => '?').join(', ')})`, addonIds);
  }

  async findConflicts(roomId: string, ranges: TimeRange[]): Promise<TimeRange[]> {
    if (ranges.length === 0) return [];
    const overlap = ranges.map(() => '(d.starts_at < ? AND d.ends_at > ?)').join(' OR ');
    const rows = await this.database.query<{ startsAt: Date | string; endsAt: Date | string }>(
      `SELECT d.starts_at AS startsAt, d.ends_at AS endsAt FROM room_booking_day d JOIN room_booking b ON b.id = d.booking_id
       WHERE d.room_id = ? AND d.status = 'ACTIVE' AND b.status IN ('PENDING', 'APPROVED') AND (${overlap}) ORDER BY d.starts_at`,
      [roomId, ...ranges.flatMap((range) => [toMariaDbDatetime(range.endsAt), toMariaDbDatetime(range.startsAt)])]
    );
    return rows.map((row) => ({ startsAt: fromMariaDbDatetime(row.startsAt), endsAt: fromMariaDbDatetime(row.endsAt) }));
  }

  async nextSequence(year: number): Promise<number> {
    await this.database.execute('INSERT INTO room_booking_sequence (year, last_value) VALUES (?, 0) ON DUPLICATE KEY UPDATE year = year', [year]);
    const row = (await this.database.query<{ lastValue: number }>('SELECT last_value AS lastValue FROM room_booking_sequence WHERE year = ? FOR UPDATE', [year]))[0]!;
    const next = Number(row.lastValue) + 1;
    await this.database.execute('UPDATE room_booking_sequence SET last_value = ? WHERE year = ?', [next, year]);
    return next;
  }

  async currentOrganizationId(personId: string): Promise<string | null> {
    const row = (await this.database.query<{ organizationId: string }>('SELECT organization_id AS organizationId FROM employment_assignment WHERE person_id = ? AND effective_until IS NULL ORDER BY effective_from DESC LIMIT 1', [personId]))[0];
    return row?.organizationId ?? null;
  }

  async findApproverPersonIds(organizationId: string): Promise<string[]> {
    const rows = await this.database.query<{ personId: string; roleName: string }>(
      'SELECT DISTINCT a.person_id AS personId, r.name AS roleName FROM role_assignment a JOIN role r ON r.id = a.role_id WHERE (a.organization_id IS NULL OR a.organization_id = ?)',
      [organizationId]
    );
    return [...new Set(rows.filter((row) => roleGrantsPermission(row.roleName, 'room.booking.decide')).map((row) => row.personId))].sort();
  }

  async insertBooking(booking: RoomBookingRecord, days: RoomBookingDayRecord[], addons: RoomBookingAddonRecord[]): Promise<void> {
    await this.database.execute(
      'INSERT INTO room_booking (id, reference, room_id, booker_person_id, booker_organization_id, title, attendee_count, start_minute, end_minute, status, decided_by_person_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())',
      [booking.id, booking.reference, booking.roomId, booking.bookerPersonId, booking.bookerOrganizationId, booking.title, booking.attendeeCount, booking.startMinute, booking.endMinute, booking.status, booking.decidedByPersonId]
    );
    for (const day of days) {
      await this.database.execute('INSERT INTO room_booking_day (id, booking_id, room_id, booking_date, starts_at, ends_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)', [day.id, day.bookingId, day.roomId, day.bookingDate, toMariaDbDatetime(day.startsAt), toMariaDbDatetime(day.endsAt), day.status]);
    }
    for (const addon of addons) {
      await this.database.execute('INSERT INTO room_booking_addon (id, booking_id, addon_id, addon_name, addon_unit, quantity, note) VALUES (?, ?, ?, ?, ?, ?, ?)', [addon.id, addon.bookingId, addon.addonId, addon.addonName, addon.addonUnit, addon.quantity, addon.note]);
    }
  }

  async getBookingForUpdate(bookingId: string): Promise<LockedRoomBooking | null> {
    const booking = (await this.database.query<RoomBookingRecord>(`SELECT ${bookingColumns} FROM room_booking WHERE id = ? FOR UPDATE`, [bookingId]))[0];
    if (!booking) return null;
    const room = (await this.database.query<StoredRoom>(`SELECT ${roomColumns} FROM room WHERE id = ?`, [booking.roomId]))[0]!;
    const days = await this.database.query<StoredDay>('SELECT id, booking_id AS bookingId, room_id AS roomId, booking_date AS bookingDate, starts_at AS startsAt, ends_at AS endsAt, status FROM room_booking_day WHERE booking_id = ? ORDER BY starts_at', [bookingId]);
    return {
      booking: { ...booking, attendeeCount: Number(booking.attendeeCount), startMinute: Number(booking.startMinute), endMinute: Number(booking.endMinute) },
      room: { ...room, capacity: Number(room.capacity), isBookable: Boolean(room.isBookable) },
      days: days.map((day) => ({ ...day, bookingDate: fromMariaDbDate(day.bookingDate as unknown as Date | string), startsAt: fromMariaDbDatetime(day.startsAt), endsAt: fromMariaDbDatetime(day.endsAt) }))
    };
  }

  async updateBookingStatus(bookingId: string, status: RoomBookingStatus, decidedByPersonId: string | null): Promise<void> {
    await this.database.execute('UPDATE room_booking SET status = ?, decided_by_person_id = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?', [status, decidedByPersonId, bookingId]);
  }

  async releaseDays(dayIds: string[], releasedAt: Date): Promise<void> {
    if (dayIds.length === 0) return;
    await this.database.execute(`UPDATE room_booking_day SET status = 'RELEASED', released_at = ? WHERE id IN (${dayIds.map(() => '?').join(', ')})`, [toMariaDbDatetime(releasedAt), ...dayIds]);
  }

  async appendHistory(entry: RoomBookingHistoryEntry): Promise<void> {
    await this.database.execute('INSERT INTO room_booking_history (id, booking_id, actor_person_id, action, reason, created_at) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(6))', [entry.id, entry.bookingId, entry.actorPersonId, entry.action, entry.reason]);
  }

  async saveOutbox(event: OutboxEvent): Promise<void> {
    await this.database.execute('INSERT INTO outbox_event (id, type, idempotency_key, payload, occurred_at, processed_at) VALUES (?, ?, ?, ?, ?, NULL)', [event.id, event.type, event.idempotencyKey, JSON.stringify(event.payload), toMariaDbDatetime(new Date(event.occurredAt))]);
  }

  async appendAudit(event: AuditEvent): Promise<void> {
    await this.database.execute('INSERT INTO audit_event (id, actor_person_id, action, target_type, target_id, result, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())', [event.id, event.actorPersonId ?? null, event.action, event.targetType, event.targetId, event.result, event.metadata]);
  }
}

type StoredRoomDetails = Omit<RoomDetails, 'isBookable'> & { isBookable: number };

export class DatabaseRoomCatalogRepository implements RoomCatalogRepository {
  constructor(private readonly database: Database) {}
  transaction<T>(work: (repository: RoomCatalogRepository) => Promise<T>): Promise<T> { return this.database.transaction((database) => work(new DatabaseRoomCatalogRepository(database))); }
  async findRoom(roomId: string): Promise<RoomDetails | null> {
    const row = (await this.database.query<StoredRoomDetails>('SELECT id, name, place, capacity, equipment, owner_organization_id AS ownerOrganizationId, is_bookable AS isBookable FROM room WHERE id = ? FOR UPDATE', [roomId]))[0];
    return row ? { ...row, capacity: Number(row.capacity), isBookable: Boolean(row.isBookable) } : null;
  }
  async saveRoom(room: RoomDetails): Promise<void> {
    await this.database.execute(
      'INSERT INTO room (id, name, place, capacity, equipment, owner_organization_id, is_bookable, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE name = VALUES(name), place = VALUES(place), capacity = VALUES(capacity), equipment = VALUES(equipment), owner_organization_id = VALUES(owner_organization_id), is_bookable = VALUES(is_bookable), updated_at = UTC_TIMESTAMP()',
      [room.id, room.name, room.place, room.capacity, room.equipment, room.ownerOrganizationId, room.isBookable ? 1 : 0]
    );
  }
  async findAddon(addonId: string): Promise<RoomAddonDetails | null> {
    const row = (await this.database.query<Omit<RoomAddonDetails, 'isActive'> & { isActive: number }>('SELECT id, name, unit, is_active AS isActive FROM room_addon WHERE id = ? FOR UPDATE', [addonId]))[0];
    return row ? { ...row, isActive: Boolean(row.isActive) } : null;
  }
  async saveAddon(addon: RoomAddonDetails): Promise<void> {
    await this.database.execute('INSERT INTO room_addon (id, name, unit, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE name = VALUES(name), unit = VALUES(unit), is_active = VALUES(is_active), updated_at = UTC_TIMESTAMP()', [addon.id, addon.name, addon.unit, addon.isActive ? 1 : 0]);
  }
  async appendAudit(event: AuditEvent): Promise<void> {
    await this.database.execute('INSERT INTO audit_event (id, actor_person_id, action, target_type, target_id, result, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())', [event.id, event.actorPersonId ?? null, event.action, event.targetType, event.targetId, event.result, event.metadata]);
  }
}
